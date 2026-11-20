import { createCipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function encryptWebhookSecret(secret: string) {
  const configured = env.WEBHOOK_ENCRYPTION_KEY;
  if (!configured) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(configured, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("hex"),
    secretAuthTag: cipher.getAuthTag().toString("hex")
  };
}
