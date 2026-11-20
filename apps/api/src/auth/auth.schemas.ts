import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128).regex(/[a-z]/, "Must include a lowercase letter").regex(/[A-Z]/, "Must include an uppercase letter").regex(/[0-9]/, "Must include a number"),
  organizationName: z.string().trim().min(2).max(160),
  organizationSlug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid()
});
