import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { authRouter } from "./auth/auth.routes.js";
import { organizationRouter } from "./organizations/organization.routes.js";
import { facilityRouter } from "./facilities/facility.routes.js";
import { activityRouter } from "./activities/activity.routes.js";
import { emissionFactorRouter } from "./emission-factors/emission-factor.routes.js";
import { calculationRouter } from "./calculations/calculation.routes.js";
import { activityImportRouter } from "./imports/activity-import.routes.js";
import { supplierRouter } from "./suppliers/supplier.routes.js";
import { supplierEvidenceRouter } from "./suppliers/supplier-evidence.routes.js";
import { env } from "./config/env.js";
import { requireAuth } from "./auth/auth.middleware.js";
import { prisma } from "./lib/prisma.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/v1/health/live", (_req, res) => {
  res.status(200).json({ status: "ok", service: "carbonledger-api" });
});

app.get("/api/v1/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", dependencies: { database: "up" } });
  } catch {
    res.status(503).json({ status: "not_ready", dependencies: { database: "down" } });
  }
});

app.get("/api/v1/meta", (_req, res) => {
  res.status(200).json({ name: "CarbonLedger API", version: "v1", environment: env.NODE_ENV });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations", organizationRouter);
app.use("/api/v1/facilities", requireAuth, facilityRouter);
app.use("/api/v1/activity-records", requireAuth, activityRouter);
app.use("/api/v1/emission-factors", requireAuth, emissionFactorRouter);
app.use("/api/v1/calculations", requireAuth, calculationRouter);
app.use("/api/v1/activity-imports", requireAuth, activityImportRouter);
app.use("/api/v1/suppliers", requireAuth, supplierRouter);
app.use("/api/v1/suppliers", requireAuth, supplierEvidenceRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("Unhandled request error", error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
};

app.use(errorHandler);
