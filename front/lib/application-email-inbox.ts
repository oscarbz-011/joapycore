export interface InboxSynchronizationOptions<T> {
  sync: () => Promise<unknown>;
  load: () => Promise<T[]>;
  replaceCached: (messages: T[]) => void;
}

export type InboxSynchronizationResult =
  | { ok: true }
  | { ok: false; error: unknown };

export async function synchronizeInboxPreservingCache<T>({
  sync,
  load,
  replaceCached,
}: InboxSynchronizationOptions<T>): Promise<InboxSynchronizationResult> {
  try {
    await sync();
    replaceCached(await load());
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
