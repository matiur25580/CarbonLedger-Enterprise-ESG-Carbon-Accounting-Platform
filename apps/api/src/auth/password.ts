import bcrypt from "bcryptjs";

const WORK_FACTOR = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, WORK_FACTOR);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
