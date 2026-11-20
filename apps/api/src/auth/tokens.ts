import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  jti: string;
}

export function issueAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "carbonledger-api",
    audience: "carbonledger-web"
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: "carbonledger-api",
    audience: "carbonledger-web"
  });
  if (typeof decoded === "string" || !decoded.sub || !decoded.organizationId || !decoded.jti) {
    throw new Error("Invalid access token claims");
  }
  return decoded as AccessTokenPayload;
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
