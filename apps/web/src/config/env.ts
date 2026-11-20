import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:4000/api/v1")
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error("Invalid frontend environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Frontend environment validation failed");
}

export const env = parsed.data;
