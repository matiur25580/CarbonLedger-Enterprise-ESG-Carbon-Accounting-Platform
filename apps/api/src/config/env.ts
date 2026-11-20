import "dotenv/config";
import { envSchema } from "./env-schema.js";

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("API environment validation failed");
}

export const env = parsed.data;
