import { describe, expect, it, vi } from "vitest";
import { synchronizeInboxPreservingCache } from "./application-email-inbox";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("application email inbox synchronization", () => {
  it("loads persisted messages after synchronization fails", async () => {
    const cachedMessages = [{ id: "persisted-message" }];
    let visibleMessages = cachedMessages;
    const reloadedMessages = [{ id: "persisted-after-sync-failure" }];
    const syncError = new Error("IMAP unavailable");
    const load = vi.fn().mockResolvedValue(reloadedMessages);
    const replaceCached = vi.fn((messages: Array<{ id: string }>) => {
      visibleMessages = messages;
    });

    const result = await synchronizeInboxPreservingCache({
      cancelPendingLoad: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockRejectedValue(syncError),
      load,
      replaceCached,
    });

    expect(result).toEqual({ ok: false, error: syncError });
    expect(load).toHaveBeenCalledOnce();
    expect(replaceCached).toHaveBeenCalledWith(reloadedMessages);
    expect(visibleMessages).toBe(reloadedMessages);
  });

  it("neutralizes a pending stale load before publishing post-sync messages", async () => {
    const pendingStaleLoad = deferred<Array<{ id: string }>>();
    const postSyncMessages = [{ id: "post-sync" }];
    let pendingLoadActive = true;
    let visibleMessages = [{ id: "cached" }];
    const events: string[] = [];

    void pendingStaleLoad.promise.then((messages) => {
      if (pendingLoadActive) visibleMessages = messages;
    });

    await synchronizeInboxPreservingCache({
      cancelPendingLoad: vi.fn(async () => {
        events.push("cancel");
        pendingLoadActive = false;
      }),
      sync: vi.fn(async () => {
        events.push("sync");
      }),
      load: vi.fn(async () => {
        events.push("load");
        return postSyncMessages;
      }),
      replaceCached: vi.fn((messages) => {
        events.push("replace");
        visibleMessages = messages;
      }),
    });

    pendingStaleLoad.resolve([{ id: "stale-pre-sync" }]);
    await pendingStaleLoad.promise;
    await Promise.resolve();

    expect(events).toEqual(["cancel", "sync", "load", "replace"]);
    expect(visibleMessages).toBe(postSyncMessages);
  });

  it("preserves existing cache when the post-attempt local load fails", async () => {
    const cachedMessages = [{ id: "cached" }];
    let visibleMessages = cachedMessages;
    const loadError = new Error("local inbox unavailable");
    const replaceCached = vi.fn((messages: Array<{ id: string }>) => {
      visibleMessages = messages;
    });

    const result = await synchronizeInboxPreservingCache({
      cancelPendingLoad: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockRejectedValue(loadError),
      replaceCached,
    });

    expect(result).toEqual({ ok: false, error: loadError });
    expect(replaceCached).not.toHaveBeenCalled();
    expect(visibleMessages).toBe(cachedMessages);
  });
});
