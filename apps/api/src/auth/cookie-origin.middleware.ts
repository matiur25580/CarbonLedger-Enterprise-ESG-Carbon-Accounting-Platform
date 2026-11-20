import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("origin");
  if (!origin || origin !== env.WEB_ORIGIN) {
    res.status(403).json({ error: { code: "UNTRUSTED_ORIGIN", message: "Request origin is not allowed" } });
    return;
  }
  next();
}
