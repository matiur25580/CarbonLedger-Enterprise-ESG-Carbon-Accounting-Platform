export async function compareAndSetInitiativeStatus<TStatus extends string, T>(
  expectedStatus: TStatus,
  update: (expectedStatus: TStatus) => Promise<number>,
  load: () => Promise<T | null>,
): Promise<{ ok: true; record: T | null } | { ok: false }> {
  const changed = await update(expectedStatus);
  if (changed !== 1) return { ok: false };
  return { ok: true, record: await load() };
}
