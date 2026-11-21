export async function compareAndSetInitiativeStatus<T>(
  expectedStatus: string,
  update: (expectedStatus: string) => Promise<number>,
  load: () => Promise<T | null>,
): Promise<{ ok: true; record: T | null } | { ok: false }> {
  const changed = await update(expectedStatus);
  if (changed !== 1) return { ok: false };
  return { ok: true, record: await load() };
}
