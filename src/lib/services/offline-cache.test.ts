import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  saveArticlesToOfflineCache,
  getOfflineArticles,
  saveFeedsToOfflineCache,
  getOfflineFeeds,
  queueOfflineMutation,
  flushOfflineMutations,
  CachedArticle,
  OfflineMutation,
} from "./offline-cache";

// Minimal in-memory IndexedDB mock for unit testing
class MockIDBObjectStore {
  name: string;
  data: Map<any, any> = new Map();
  indexes: Map<string, string> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  createIndex(name: string, keyPath: string, _options?: any) {
    this.indexes.set(name, keyPath);
  }

  index(name: string) {
    return {
      openCursor: () => {
        const req: any = {};
        setTimeout(() => {
          if (req.onsuccess) {
            req.onsuccess({ target: { result: null } });
          }
        }, 0);
        return req;
      },
    };
  }

  get(key: any) {
    const req: any = {};
    const val = this.data.get(key);
    setTimeout(() => {
      req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }

  getAll() {
    const req: any = {};
    const vals = Array.from(this.data.values()).map((v) => JSON.parse(JSON.stringify(v)));
    setTimeout(() => {
      req.result = vals;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }

  put(value: any) {
    const key = value.id;
    this.data.set(key, JSON.parse(JSON.stringify(value)));
    const req: any = { result: key };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }

  add(value: any) {
    const id = value.id ?? Math.floor(Math.random() * 1000000);
    const item = { ...value, id };
    this.data.set(id, JSON.parse(JSON.stringify(item)));
    const req: any = { result: id };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }

  delete(key: any) {
    this.data.delete(key);
    const req: any = {};
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }

  count() {
    const req: any = {};
    setTimeout(() => {
      req.result = this.data.size;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
}

class MockIDBDatabase {
  stores: Map<string, MockIDBObjectStore> = new Map();

  get objectStoreNames() {
    return {
      contains: (name: string) => this.stores.has(name),
    };
  }

  createObjectStore(name: string, _options?: any) {
    const store = new MockIDBObjectStore(name);
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string[], _mode: string) {
    const db = this;
    return {
      objectStore: (name: string) => db.stores.get(name)!,
    };
  }
}

let activeMockDb: MockIDBDatabase;

function setupMockEnvironment() {
  activeMockDb = new MockIDBDatabase();

  const mockIndexedDB = {
    open: (_name: string, _version: number) => {
      const req: any = {};
      setTimeout(() => {
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: { result: activeMockDb } });
        }
        req.result = activeMockDb;
        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      }, 0);
      return req;
    },
  };

  (globalThis as any).window = {
    indexedDB: mockIndexedDB,
  };
  (globalThis as any).navigator = {
    onLine: true,
  };
}

describe("Offline Cache & Mutation Sync Engine", () => {
  beforeEach(() => {
    setupMockEnvironment();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).navigator;
  });

  it("persists articles and user notes in IndexedDB cache", async () => {
    const articles = [
      {
        id: "art-1",
        title: "Detection Engineering Principles",
        url: "https://example.com/detection",
        snippet: "Core principles...",
        fullContentHtml: "<article>Full Content</article>",
        isRead: false,
        isStarred: true,
        userNotes: "Investigate sigma rule translation",
        tags: ["detection", "security"],
        sourceQueue: "research_inbox" as const,
      },
    ];

    await saveArticlesToOfflineCache(articles);
    // Allow macro-task queue to complete IDB transactions
    await new Promise((r) => setTimeout(r, 20));

    const offlineItems = await getOfflineArticles();
    expect(offlineItems.length).toBe(1);
    expect(offlineItems[0].id).toBe("art-1");
    expect(offlineItems[0].userNotes).toBe("Investigate sigma rule translation");
    expect(offlineItems[0].tags).toBe("detection,security");
    expect(offlineItems[0].sourceQueue).toBe("research_inbox");
  });

  it("preserves existing local user notes when incoming items have empty notes", async () => {
    const initial = [
      {
        id: "art-2",
        title: "Threat Modeling Deep Dive",
        url: "https://example.com/tm",
        userNotes: "Draft written offline on flight",
        tags: "cloud,stride",
      },
    ];

    await saveArticlesToOfflineCache(initial);
    await new Promise((r) => setTimeout(r, 20));

    // Stale remote fetch with empty user notes should not wipe local notes
    const incomingStale = [
      {
        id: "art-2",
        title: "Threat Modeling Deep Dive",
        url: "https://example.com/tm",
        userNotes: "",
      },
    ];

    await saveArticlesToOfflineCache(incomingStale);
    await new Promise((r) => setTimeout(r, 20));

    const retrieved = await getOfflineArticles();
    expect(retrieved[0].userNotes).toBe("Draft written offline on flight");
    expect(retrieved[0].tags).toBe("cloud,stride");
  });

  it("correctly filters offline articles by queue type", async () => {
    const dataset = [
      {
        id: "item-research",
        title: "Research Paper on LLM Agents",
        sourceQueue: "research_inbox" as const,
        isStarred: false,
        isRead: false,
      },
      {
        id: "item-readlater",
        title: "Weekly Architectural Notes",
        sourceQueue: "read_later" as const,
        isStarred: true,
        isRead: false,
      },
      {
        id: "item-rss",
        title: "Breaking News Item",
        isStarred: false,
        isRead: true,
      },
    ];

    await saveArticlesToOfflineCache(dataset);
    await new Promise((r) => setTimeout(r, 20));

    // Research Inbox Only
    const researchOnly = await getOfflineArticles({ readingListOnly: true });
    expect(researchOnly.length).toBe(1);
    expect(researchOnly[0].id).toBe("item-research");

    // Reading Queue (both Research Inbox and Read Later / Starred)
    const queue = await getOfflineArticles({ readingQueueOnly: true });
    expect(queue.length).toBe(2);
    const queueIds = queue.map((q) => q.id);
    expect(queueIds).toContain("item-research");
    expect(queueIds).toContain("item-readlater");

    // Unread only
    const unread = await getOfflineArticles({ unreadOnly: true });
    expect(unread.length).toBe(2);
  });

  it("queues offline mutations and updates local cached article optimistically", async () => {
    await saveArticlesToOfflineCache([
      {
        id: "item-flight",
        title: "Flight Reading Material",
        isRead: false,
        isStarred: false,
        userNotes: "Original notes",
      },
    ]);
    await new Promise((r) => setTimeout(r, 20));

    // Queue note update while offline
    await queueOfflineMutation("update_notes", "item-flight", "Updated notes while offline in flight");
    await queueOfflineMutation("toggle_read", "item-flight", true);
    await new Promise((r) => setTimeout(r, 20));

    // Check optimistic local cache
    const cached = await getOfflineArticles();
    expect(cached[0].userNotes).toBe("Updated notes while offline in flight");
    expect(cached[0].isRead).toBe(true);

    // Verify mutation queue has both records
    const mutationStore = activeMockDb.stores.get("mutations")!;
    expect(mutationStore.data.size).toBe(2);
  });

  it("flushes queued mutations via PATCH /api/items when back online", async () => {
    await queueOfflineMutation("toggle_read", "item-sync-1", true);
    await queueOfflineMutation("update_notes", "item-sync-1", "Synced note payload");
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls: { url: string; method: string; body: any }[] = [];
    (globalThis as any).fetch = async (url: string, init: any) => {
      fetchCalls.push({
        url,
        method: init.method,
        body: JSON.parse(init.body),
      });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };

    const replayed = await flushOfflineMutations();
    await new Promise((r) => setTimeout(r, 20));

    expect(replayed).toBe(2);
    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toBe("/api/items");
    expect(fetchCalls[0].method).toBe("PATCH");
    expect(fetchCalls[0].body).toEqual({ id: "item-sync-1", isRead: true });

    expect(fetchCalls[1].url).toBe("/api/items");
    expect(fetchCalls[1].body).toEqual({
      id: "item-sync-1",
      userNotes: "Synced note payload",
    });

    // Mutation queue should now be empty
    const mutationStore = activeMockDb.stores.get("mutations")!;
    expect(mutationStore.data.size).toBe(0);
  });
});
