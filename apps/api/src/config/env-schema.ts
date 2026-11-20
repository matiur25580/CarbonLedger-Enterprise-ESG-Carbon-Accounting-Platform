import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional(),
  APP_DATABASE_URL: z.string().min(1, "APP_DATABASE_URL is required for application queries"),
  DATABASE_ADMIN_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
  WEBHOOK_ENCRYPTION_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^[a-fA-F0-9]{64}$/, "WEBHOOK_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters").optional()),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
  EVIDENCE_S3_BUCKET: z.string().min(3).optional(),
  EVIDENCE_S3_REGION: z.string().min(2).optional(),
  EVIDENCE_S3_ENDPOINT: z.string().url().optional(),
  EVIDENCE_S3_ACCESS_KEY_ID: z.string().min(8).optional(),
  EVIDENCE_S3_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  CLAMAV_HOST: z.string().min(1).optional(),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310)
}).superRefine((value, context) => {
  const storageValues = [value.EVIDENCE_S3_BUCKET, value.EVIDENCE_S3_REGION, value.EVIDENCE_S3_ACCESS_KEY_ID, value.EVIDENCE_S3_SECRET_ACCESS_KEY];
  if (storageValues.some(Boolean) && !storageValues.every(Boolean)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["EVIDENCE_S3_BUCKET"], message: "All required EVIDENCE_S3_* storage settings must be configured together" });
  }
  if (value.NODE_ENV === "production" && !value.COOKIE_SECURE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE=true is required in production"
    });
  }
});
