import { createDecipheriv, createHmac } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";

const MAX_ATTEMPTS = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_PAYLOAD_BYTES = 256 * 1024;

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a = 0, b = 0, c = 0] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family !== 6) return false;
  const value = address.toLowerCase().split("%")[0] ?? "";
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    if (isIP(mapped) === 4) return isPublicAddress(mapped);
    const pieces = mapped.split(":");
    if (pieces.length === 2 && pieces.every((part) => /^[a-f0-9]{1,4}$/.test(part))) {
      const hi = Number.parseInt(pieces[0]!, 16);
      const lo = Number.parseInt(pieces[1]!, 16);
      return isPublicAddress([`${hi >> 8}`, `${hi & 255}`, `${lo >> 8}`, `${lo & 255}`].join("."));
    }
    return false;
  }
  const first = Number.parseInt(value.split(":")[0] || "0", 16) || 0;
  // Permit only global-unicast 2000::/3; reject documentation, benchmarking,
  // ORCHID and other special-purpose blocks within that range.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (value.startsWith("2001:db8:") || value.startsWith("2001:2:") ||
      value.startsWith("2001:10:") || value.startsWith("2001:20:")) return false;
  return true;
}

async function resolvePublicDestination(hostname: string) {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Webhook destination resolves to a non-public or reserved IP address");
  }
  return addresses[0]!;
}

function decryptWebhookSecret(endpoint: {
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
}): string {
  const configured = env.WEBHOOK_ENCRYPTION_KEY;
  if (!configured) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured on the worker");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(configured, "hex"), Buffer.from(endpoint.secretIv, "hex"));
  decipher.setAuthTag(Buffer.from(endpoint.secretAuthTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(endpoint.secretCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export async function postWebhook(input: {
  url: string;
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
  eventId: string;
  eventType: string;
  payload: Prisma.JsonValue;
}): Promise<number> {
  const url = new URL(input.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443") {
    throw new Error("Webhook URL violates outbound HTTPS policy");
  }
  const resolved = await resolvePublicDestination(url.hostname);
  const body = Buffer.from(JSON.stringify(input.payload), "utf8");
  if (body.byteLength > MAX_PAYLOAD_BYTES) throw new Error("Webhook payload exceeds 256 KiB");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = decryptWebhookSecret(input);
  const signature = createHmac("sha256", secret).update(timestamp).update(".").update(body).digest("hex");
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: "https:",
      hostname: url.hostname,
      port: 443,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      agent: false,
      rejectUnauthorized: true,
      // Pin the socket to the address already checked above; do not perform a
      // second DNS lookup that could be rebound between validation and connect.
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "content-type": "application/json",
        "content-length": body.byteLength,
        "user-agent": "CarbonLedger-Webhooks/1.0",
        "x-carbonledger-event": input.eventType,
        "x-carbonledger-event-id": input.eventId,
        "x-carbonledger-timestamp": timestamp,
        "x-carbonledger-signature": `v1=${signature}`
      }
    }, (response) => {
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_RESPONSE_BYTES) request.destroy(new Error("Webhook response exceeded 16 KiB"));
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve(status);
        else reject(Object.assign(new Error(`Webhook receiver returned HTTP ${status}`), { statusCode: status }));
      });
    });
    request.on("timeout", () => request.destroy(new Error("Webhook request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

export function retryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 10));
  const base = 30_000 * (2 ** exponent);
  return Math.floor(Math.min(base * (0.8 + Math.random() * 0.4), 6 * 60 * 60 * 1000));
}

export const webhookWorkerLimits = { maxAttempts: MAX_ATTEMPTS };
