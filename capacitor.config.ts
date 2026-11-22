import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
if (!serverUrl)
  throw new Error(
    "CAPACITOR_SERVER_URL doit contenir l’URL HTTPS de l’application Netlify.",
  );

const parsedServerUrl = new URL(serverUrl);
if (parsedServerUrl.protocol !== "https:")
  throw new Error("CAPACITOR_SERVER_URL doit utiliser HTTPS.");

const config: CapacitorConfig = {
  appId: "com.hsely.audit",
  appName: "HSELY Audit",
  webDir: "dist/spa",
  server: {
    url: parsedServerUrl.toString().replace(/\/$/, ""),
    cleartext: false,
  },
};

export default config;
