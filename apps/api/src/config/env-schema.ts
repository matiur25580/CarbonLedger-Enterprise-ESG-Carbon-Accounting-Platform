import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for migrations"),
  APP_DATABASE_URL: z.string().min(1, "APP_DATABASE_URL is required for application queries"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && !value.COOKIE_SECURE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE=true is required in production"
    });
  }
});
