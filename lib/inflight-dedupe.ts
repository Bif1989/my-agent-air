const inFlightReads = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(scope: string, key: string, run: () => Promise<T>): Promise<T> {
  const requestKey = `${scope}:${key}`;
  const existing = inFlightReads.get(requestKey) as Promise<T> | undefined;
  if (existing) return existing;

  const task = run().finally(() => {
    if (inFlightReads.get(requestKey) === task) inFlightReads.delete(requestKey);
  });
  inFlightReads.set(requestKey, task);
  return task;
}
