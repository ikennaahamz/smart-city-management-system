import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { DatabaseError } from "./db";
import { attachUser } from "./middleware";
import { departmentsRouter, rolesRouter, usersRouter } from "./routes/admin";
import analyticsRouter from "./routes/analytics";
import authRouter from "./routes/auth";
import { citizensRouter, utilityAccountsRouter } from "./routes/citizens";
import devicesRouter from "./routes/devices";
import overviewRouter from "./routes/overview";
import requestsRouter from "./routes/requests";
import workOrdersRouter from "./routes/workOrders";

const PUBLIC_DIR =
  [
    path.resolve(__dirname, "..", "public"),
    path.resolve(__dirname, "..", "..", "public"),
    path.resolve(process.cwd(), "public"),
  ].find((dir) => existsSync(dir)) ?? path.resolve(process.cwd(), "public");

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "smart-city-management-system" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/overview", overviewRouter);
  app.use("/api/requests", requestsRouter);
  app.use("/api/work-orders", workOrdersRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/citizens", citizensRouter);
  app.use("/api/utility-accounts", utilityAccountsRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/analytics", analyticsRouter);

  app.use(express.static(PUBLIC_DIR));

  // Express 5 safe GET fallback for browser reloads on non-API paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      res.sendFile(path.join(PUBLIC_DIR, "index.html"), (err) => {
        if (err) next(err);
      });
      return;
    }
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: `API endpoint ${req.method} ${req.path} not found.` });
      return;
    }
    next();
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DatabaseError) {
      const status =
        err.sqlstate === "23505" || err.sqlstate === "23503"
          ? 409
          : err.sqlstate === "23514" || err.sqlstate === "P0001" || err.sqlstate === "22P02"
            ? 400
            : err.sqlstate === "CONNECT" || err.sqlstate === "CONFIG"
              ? 503
              : 500;
      res.status(status).json({ error: err.message, sqlstate: err.sqlstate });
      return;
    }

    const message = err instanceof Error ? err.message : "Unexpected server error.";
    res.status(500).json({ error: message });
  });

  return app;
}

const app = createApp();
export default app;
