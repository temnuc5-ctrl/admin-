import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import {
  handleAdminConfig,
  handleAdminExport,
  handleAdminExportFile,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminReports,
  handleAdminSession,
  requireAdmin,
} from "./routes/admin";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/admin/login", handleAdminLogin);
  app.get("/api/admin/session", handleAdminSession);
  app.post("/api/admin/logout", handleAdminLogout);
  app.get("/api/admin/config", requireAdmin, handleAdminConfig);
  app.get("/api/admin/reports", requireAdmin, handleAdminReports);
  app.post("/api/admin/export", requireAdmin, handleAdminExport);
  app.get("/api/admin/export/file/:token", requireAdmin, handleAdminExportFile);

  return app;
}
