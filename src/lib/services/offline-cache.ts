/**
 * Zero-dependency client-side offline storage engine using native browser IndexedDB.
 * Manages cached articles, feed metadata, and an offline mutation sync queue.
 */

const DB_NAME = "synapse_offline_db";
const DB_VERSION = 1;
const MAX_CACHED_ARTICLES = 250;

export interface CachedArticle {
  id: string;
  feedId: string;
  feedTitle?: string;
  title: string;
  url: string;
  snippet?: string;
  fullContentHtml?: string;
  fullContentMarkdown?: string;
  isRead: boolean;
  isStarred: boolean;
  isWork: boolean;
  mediaType?: string;
  publishedAt?: number | string | null;
  cachedAt: number;
}

export interface OfflineMutation {
  id?: number;
  type: "toggle_read" | "toggle_star" | "toggle_work";
  itemId: string;
  value: boolean;
  timestamp: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Articles store
      if (!db.objectStoreNames.contains("articles")) {
        const articleStore = db.createObjectStore("articles", { keyPath: "id" });
        articleStore.createIndex("publishedAt", "publishedAt", { unique: false });
        articleStore.createIndex("isStarred", "isStarred", { unique: false });
        articleStore.createIndex("isRead", "isRead", { unique: false });
        articleStore.createIndex("cachedAt", "cachedAt", { unique: false });
      }

      // Feeds store
      if (!db.objectStoreNames.contains("feeds")) {
        db.createObjectStore("feeds", { keyPath: "id" });
      }

      // Offline mutations queue
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Batch saves articles into IndexedDB with LRU eviction to prevent storage pressure.
 */
export async function saveArticlesToOfflineCache(articles: any[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(["articles"], "readwrite");
    const store = tx.objectStore("articles");
    const now = Date.now();

    for (const item of articles) {
      if (!item || !item.id) continue;
      const cached: CachedArticle = {
        id: item.id,
        feedId: item.feedId || "",
        feedTitle: item.feedTitle || "",
        title: item.title || "",
        url: item.url || "",
        snippet: item.snippet || "",
        fullContentHtml: item.fullContentHtml || "",
        fullContentMarkdown: item.fullContentMarkdown || "",
        isRead: Boolean(item.isRead),
        isStarred: Boolean(item.isStarred),
        isWork: Boolean(item.isWork),
        mediaType: item.mediaType || "article",
        publishedAt: item.publishedAt || null,
        cachedAt: now,
      };
      store.put(cached);
    }

    // Prune cache to MAX_CACHED_ARTICLES
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_CACHED_ARTICLES) {
        const excess = countReq.result - MAX_CACHED_ARTICLES;
        const index = store.index("cachedAt");
        const cursorReq = index.openCursor();
        let deleted = 0;

        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < excess) {
            // Keep starred items safe from LRU eviction
            if (!cursor.value.isStarred) {
              cursor.delete();
              deleted++;
            }
            cursor.continue();
          }
        };
      }
    };
  } catch (err) {
    console.warn("Failed to persist articles in offline cache", err);
  }
}

/**
 * Retrieves articles from the offline store filtered by view conditions.
 */
export async function getOfflineArticles(filter?: {
  unreadOnly?: boolean;
  starredOnly?: boolean;
  videoOnly?: boolean;
  textOnly?: boolean;
  workOnly?: boolean;
  feedId?: string;
  category?: string;
  searchQuery?: string;
}): Promise<any[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(["articles"], "readonly");
      const store = tx.objectStore("articles");
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result as CachedArticle[];

        if (filter?.unreadOnly) {
          results = results.filter((a) => !a.isRead);
        }
        if (filter?.starredOnly) {
          results = results.filter((a) => a.isStarred);
        }
        if (filter?.workOnly) {
          results = results.filter((a) => a.isWork);
        }
        if (filter?.videoOnly) {
          results = results.filter((a) => a.mediaType === "video");
        }
        if (filter?.textOnly) {
          results = results.filter((a) => a.mediaType !== "video");
        }
        if (filter?.feedId) {
          results = results.filter((a) => a.feedId === filter.feedId);
        }
        if (filter?.searchQuery?.trim()) {
          const q = filter.searchQuery.toLowerCase();
          results = results.filter(
            (a) =>
              a.title.toLowerCase().includes(q) ||
              (a.snippet && a.snippet.toLowerCase().includes(q))
          );
        }

        // Sort descending by publishedAt or cachedAt
        results.sort((a, b) => {
          const timeA = typeof a.publishedAt === "number" ? a.publishedAt : a.cachedAt;
          const timeB = typeof b.publishedAt === "number" ? b.publishedAt : b.cachedAt;
          return timeB - timeA;
        });

        resolve(results);
      };

      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Saves feeds list to offline store so sidebar remains accessible while disconnected.
 */
export async function saveFeedsToOfflineCache(feeds: any[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(["feeds"], "readwrite");
    const store = tx.objectStore("feeds");
    for (const f of feeds) {
      if (f && f.id) store.put(f);
    }
  } catch (err) {
    console.warn("Failed to persist feeds in offline cache", err);
  }
}

/**
 * Retrieves cached feeds list from offline store.
 */
export async function getOfflineFeeds(): Promise<any[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(["feeds"], "readonly");
      const store = tx.objectStore("feeds");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Enqueues a user action performed while offline to be replayed upon reconnection.
 */
export async function queueOfflineMutation(
  type: "toggle_read" | "toggle_star" | "toggle_work",
  itemId: string,
  value: boolean
): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(["mutations", "articles"], "readwrite");
    const mutationStore = tx.objectStore("mutations");
    const articleStore = tx.objectStore("articles");

    // 1. Enqueue mutation
    mutationStore.add({
      type,
      itemId,
      value,
      timestamp: Date.now(),
    });

    // 2. Update local cached article optimistically
    const getReq = articleStore.get(itemId);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const updated = { ...getReq.result };
        if (type === "toggle_read") updated.isRead = value;
        if (type === "toggle_star") updated.isStarred = value;
        if (type === "toggle_work") updated.isWork = value;
        articleStore.put(updated);
      }
    };
  } catch (err) {
    console.warn("Failed to queue offline mutation", err);
  }
}

/**
 * Flushes all queued mutations to the Synapse server when coming back online.
 */
export async function flushOfflineMutations(): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;

  try {
    const db = await openDatabase();
    const tx = db.transaction(["mutations"], "readonly");
    const store = tx.objectStore("mutations");
    const mutations: (OfflineMutation & { id: number })[] = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (mutations.length === 0) return 0;

    let processed = 0;
    for (const m of mutations) {
      try {
        let endpoint = "";
        let body: any = {};

        if (m.type === "toggle_read") {
          endpoint = `/api/items/${m.itemId}/read`;
          body = { isRead: m.value };
        } else if (m.type === "toggle_star") {
          endpoint = `/api/items/${m.itemId}/star`;
          body = { isStarred: m.value };
        } else if (m.type === "toggle_work") {
          endpoint = `/api/items/${m.itemId}/work`;
          body = { isWork: m.value };
        }

        if (endpoint) {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (res.ok) {
            // Delete mutation from queue
            const delTx = db.transaction(["mutations"], "readwrite");
            delTx.objectStore("mutations").delete(m.id);
            processed++;
          }
        }
      } catch (err) {
        console.warn(`Failed to replay mutation ${m.id}`, err);
      }
    }

    return processed;
  } catch (err) {
    console.warn("Error flushing offline mutations", err);
    return 0;
  }
}
