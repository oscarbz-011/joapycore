export interface InboxSynchronizationOptions<T> {
  cancelPendingLoad: () => Promise<unknown>;
  sync: () => Promise<unknown>;
  load: () => Promise<T[]>;
  replaceCached: (messages: T[]) => void;
}

export type InboxSynchronizationResult =
  | { ok: true }
  | { ok: false; error: unknown };

export async function synchronizeInboxPreservingCache<T>({
  cancelPendingLoad,
  sync,
  load,
  replaceCached,
}: InboxSynchronizationOptions<T>): Promise<InboxSynchronizationResult> {
  await cancelPendingLoad();
  let synchronizationError: unknown;
  try {
    await sync();
  } catch (error) {
    synchronizationError = error;
  }

  try {
    replaceCached(await load());
  } catch (error) {
    return { ok: false, error: synchronizationError ?? error };
  }

  return synchronizationError === undefined
    ? { ok: true }
    : { ok: false, error: synchronizationError };
}
