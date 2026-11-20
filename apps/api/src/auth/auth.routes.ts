import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { AuthRequest, requireAuth } from "./auth.middleware.js";
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from "./cookies.js";
import { loginSchema, registerSchema, switchOrganizationSchema } from "./auth.schemas.js";
import { getCurrentOrganization, listUserOrganizations, login, register, revokeRefreshToken, rotateRefreshToken, switchOrganization } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Registration details are invalid", details: parsed.error.flatten() } });
    return;
  }
  try {
    const result = await register(parsed.data);
    setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _refreshToken, ...safeResult } = result;
    res.status(201).json(safeResult);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "EMAIL_IN_USE" || code === "EMAIL_OR_SLUG_CONFLICT") {
      res.status(409).json({ error: { code: "ACCOUNT_CONFLICT", message: "Email or organization slug is already registered" } });
      return;
    }
    if (code === "ORGANIZATION_SLUG_IN_USE") {
      res.status(409).json({ error: { code: "SLUG_IN_USE", message: "Organization slug is already in use" } });
      return;
    }
    res.status(500).json({ error: { code: "REGISTRATION_FAILED", message: "Unable to create account" } });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Login details are invalid" } });
    return;
  }
  try {
    const result = await login(parsed.data);
    setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _refreshToken, ...safeResult } = result;
    res.status(200).json(safeResult);
  } catch {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: { code: "REFRESH_REQUIRED", message: "Refresh session is missing" } });
    return;
  }
  try {
    const result = await rotateRefreshToken(token);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ accessToken: result.accessToken });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: { code: "REFRESH_INVALID", message: "Refresh session is invalid or expired" } });
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) await revokeRefreshToken(token);
  clearRefreshCookie(res);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth!;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true, createdAt: true }
  });
  res.status(200).json({ user, organizationId: auth.organizationId, role: auth.role });
});

authRouter.get("/organizations", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth!;
  res.status(200).json({ organizations: await listUserOrganizations(auth.userId) });
});

authRouter.post("/switch-organization", requireAuth, async (req, res) => {
  const parsed = switchOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Organization ID must be a UUID" } });
    return;
  }
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!refreshToken) {
    res.status(401).json({ error: { code: "REFRESH_REQUIRED", message: "Refresh session is required to switch organizations" } });
    return;
  }
  try {
    const result = await switchOrganization((req as AuthRequest).auth!.userId, parsed.data.organizationId, refreshToken);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ organization: result.organization, accessToken: result.accessToken });
  } catch {
    res.status(403).json({ error: { code: "ORGANIZATION_ACCESS_DENIED", message: "You are not a member of this organization" } });
  }
});

authRouter.get("/organization", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth!;
  const organization = await getCurrentOrganization(auth.organizationId);
  if (!organization) {
    res.status(404).json({ error: { code: "ORGANIZATION_NOT_FOUND", message: "Organization not found" } });
    return;
  }
  res.status(200).json({ organization, role: auth.role });
});
