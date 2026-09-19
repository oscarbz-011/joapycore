import { describe, expect, it, vi } from "vitest";
import { synchronizeInboxPreservingCache } from "./application-email-inbox";

describe("application email inbox synchronization", () => {
  it("keeps cached messages visible when synchronization fails", async () => {
    const cachedMessages = [{ id: "persisted-message" }];
    let visibleMessages = cachedMessages;
    const syncError = new Error("IMAP unavailable");
    const load = vi.fn<() => Promise<Array<{ id: string }>>>();
    const replaceCached = vi.fn((messages: Array<{ id: string }>) => {
      visibleMessages = messages;
    });

    const result = await synchronizeInboxPreservingCache({
      sync: vi.fn().mockRejectedValue(syncError),
      load,
      replaceCached,
    });

    expect(result).toEqual({ ok: false, error: syncError });
    expect(load).not.toHaveBeenCalled();
    expect(replaceCached).not.toHaveBeenCalled();
    expect(visibleMessages).toBe(cachedMessages);
  });
});
