import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("API environment validation failed");
}

export const env = parsed.data;
