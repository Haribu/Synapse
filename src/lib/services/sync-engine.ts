import { db, sqlite } from "@/lib/db";
import { feeds, feedItems } from "@/lib/db/schema";
import { fetchFeed } from "@/lib/services/feed-fetcher";
import { resolveYouTubeLongFormFeed } from "@/lib/services/youtube";
import { logger } from "@/lib/services/logger";
import { eq, sql, desc, and, or, ne, isNull, gte } from "drizzle-orm";
import crypto from "crypto";
import TurndownService from "turndown";
import { cleanArticleMarkdown, cleanAuthor } from "@/lib/utils/clean-article";
import { cleanArticleHtml } from "@/lib/utils/clean-html";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});
turndown.addRule("removeGarbage", {
  filter: ["script", "style", "noscript", "iframe", "form"],
  replacement: () => "",
});

export interface SyncFeedResult {
  feedId: string;
  title: string;
  healthy: boolean;
  status: "updated" | "not_modified" | "error";
  newItemsCount: number;
  durationMs: number;
  error?: string;
}

export interface SyncBatchSummary {
  totalFeeds: number;
  healthyCount: number;
  errorCount: number;
  newArticlesTotal: number;
  durationMs: number;
}

export interface SyncTelemetry {
  lastSyncAt: Date | null;
  durationMs: number;
  totalFeeds: number;
  standardFeedsChecked: number;
  youtubeFeedsChecked: number;
  adaptiveSkippedCount: number;
  healthyCount: number;
  errorCount: number;
  newArticlesTotal: number;
  nextScheduledAt: Date | null;
}

let lastSyncTelemetry: SyncTelemetry | null = null;

export function getLastSyncTelemetry(): SyncTelemetry | null {
  return lastSyncTelemetry;
}

let isSyncRunning = false;

export async function syncSingleFeed(feedId: string): Promise<SyncFeedResult> {
  const startTime = Date.now();
  const feed = db.select().from(feeds).where(eq(feeds.id, feedId)).get();

  if (!feed) {
    logger.warn("SyncEngine", `Feed not found: ${feedId}`);
    return {
      feedId,
      title: "Unknown",
      healthy: false,
      status: "error",
      newItemsCount: 0,
      durationMs: 0,
      error: "Feed not found",
    };
  }

  // Auto-heal poisoned YouTube feeds: restore channel_id=UC or playlist_id=UU back to UULF...
  if (feed.feedUrl.includes("youtube.com") && !feed.feedUrl.includes("playlist_id=UULF")) {
    try {
      const uulfFeedUrl = await resolveYouTubeLongFormFeed(feed.feedUrl);
      if (uulfFeedUrl && uulfFeedUrl.includes("playlist_id=UULF") && uulfFeedUrl !== feed.feedUrl) {
        db.update(feeds).set({ feedUrl: uulfFeedUrl }).where(eq(feeds.id, feedId)).run();
        feed.feedUrl = uulfFeedUrl;
      }
    } catch {
      // ignore
    }
  }

  logger.info("SyncEngine", `Fetching feed "${feed.title}"`, {
    feedId: feed.id,
    url: feed.feedUrl,
    category: feed.category,
  });

  try {
    const fetchPromise = fetchFeed(
      feed.feedUrl,
      feed.etag || undefined,
      feed.lastModified || undefined
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Feed fetch exceeded 20s timeout limit")), 20000)
    );
    const fetched = await Promise.race([fetchPromise, timeoutPromise]);
    const durationMs = Date.now() - startTime;
    const now = new Date();

    if (!fetched) {
      // 304 Not Modified
      db.update(feeds)
        .set({
          lastFetchedAt: now,
          errorCount: 0,
          lastError: null,
        })
        .where(eq(feeds.id, feedId))
        .run();

      logger.sync("SyncEngine", `Feed "${feed.title}" up-to-date (HTTP 304 Not Modified)`, {
        durationMs,
      });

      return {
        feedId,
        title: feed.title,
        healthy: true,
        status: "not_modified",
        newItemsCount: 0,
        durationMs,
      };
    }

    // Insert new items and backfill/correct dates for existing items
    let newItemsCount = 0;
    let updatedDatesCount = 0;
    const existingRowsStmt = sqlite.prepare(`
      SELECT id, guid, url, published_at, created_at FROM feed_items WHERE feed_id = ?
    `);
    const existingRows = existingRowsStmt.all(feedId) as {
      id: string;
      guid: string;
      url: string;
      published_at: number | null;
      created_at: number;
    }[];

    const existingByGuid = new Map<string, (typeof existingRows)[0]>();
    const existingByUrl = new Map<string, (typeof existingRows)[0]>();
    for (const r of existingRows) {
      if (r.guid) existingByGuid.set(r.guid, r);
      if (r.url) existingByUrl.set(r.url, r);
    }

    const updatePublishedAtStmt = sqlite.prepare(`
      UPDATE feed_items SET published_at = ? WHERE id = ?
    `);

    const syncBatch = sqlite.transaction((itemsToSync: typeof fetched.items) => {
      let inserted = 0;
      // Some feeds (event listings) use the event date as pubDate. A date more than
      // an hour ahead of now is treated as unknown and falls back to the sync time.
      const futureCutoffMs = Date.now() + 60 * 60 * 1000;
      for (const item of itemsToSync) {
        const isFutureDated = !!item.publishedAt && item.publishedAt.getTime() > futureCutoffMs;
        const effectivePublishedAt = isFutureDated ? now : (item.publishedAt ?? null);

        const existing =
          (item.guid ? existingByGuid.get(item.guid) : undefined) ||
          (item.url ? existingByUrl.get(item.url) : undefined);

        if (existing) {
          // If existing item has no publishedAt, or its publishedAt was corrupted/defaulted to sync time (abs diff <= 5s),
          // and we now have a genuine parsed publishedAt from the feed, update it!
          // Future-dated entries are skipped so they keep their sync-time date.
          if (item.publishedAt && !isFutureDated) {
            const feedPubSeconds = Math.floor(item.publishedAt.getTime() / 1000);
            const isCorrupted =
              existing.published_at == null ||
              Math.abs(existing.published_at - existing.created_at) <= 5;

            if (isCorrupted && existing.published_at !== feedPubSeconds) {
              updatePublishedAtStmt.run(feedPubSeconds, existing.id);
              updatedDatesCount++;
            }
          }
          continue;
        }

        let contentMarkdown: string | null = null;
        let isFullFetched = false;

        if (item.content && item.content.length > 100 && item.mediaType === "article") {
          try {
            const rawMd = turndown.turndown(item.content);
            const cleanedMd = cleanArticleMarkdown(rawMd, item.title);
            if (cleanedMd && cleanedMd.length > 50) {
              contentMarkdown = cleanedMd;
              // Only mark as full fetched from RSS feed if feed is NOT set to autoFullFetch (which expects true web page extraction)
              if (cleanedMd.length >= 800 && !feed.autoFullFetch) {
                isFullFetched = true;
              }
            }
          } catch {
            // ignore
          }
        }

        db.insert(feedItems)
          .values({
            id: crypto.randomUUID(),
            feedId,
            guid: item.guid,
            title: item.title,
            url: item.url,
            author: cleanAuthor(item.author) || null,
            snippet: item.snippet ?? null,
            fullContentHtml: item.content ?? null,
            fullContentMarkdown: contentMarkdown,
            isFullFetched,
            publishedAt: effectivePublishedAt,
            mediaType: item.mediaType,
            videoId: item.videoId ?? null,
            thumbnailUrl: item.thumbnailUrl ?? null,
            createdAt: now,
          })
          .run();

        inserted++;
      }
      return inserted;
    });

    newItemsCount = syncBatch(fetched.items);

    // Update feed state safely without overwriting good titles or passing undefined
    const updatePayload: Record<string, any> = {
      lastFetchedAt: now,
      errorCount: 0,
      lastError: null,
    };

    // Only update title if feed currently has no title or has a generic placeholder
    const isGenericTitle =
      !feed.title ||
      feed.title.trim() === "" ||
      feed.title === "Unknown Feed" ||
      feed.title === "Videos" ||
      feed.title === "RSS Feed";

    if (
      isGenericTitle &&
      fetched.title &&
      fetched.title.trim() !== "" &&
      fetched.title !== "Videos" &&
      fetched.title !== "Unknown Feed"
    ) {
      updatePayload.title = fetched.title;
    }
    if (fetched.siteUrl) {
      updatePayload.siteUrl = fetched.siteUrl;
    }
    if (fetched.etag !== undefined) {
      updatePayload.etag = fetched.etag ?? null;
    }
    if (fetched.lastModified !== undefined) {
      updatePayload.lastModified = fetched.lastModified ?? null;
    }
    if (fetched.discoveredFeedUrl && fetched.discoveredFeedUrl !== feed.feedUrl) {
      // Guard against downgrading a UULF long-form playlist to a raw channel_id or UU feed
      const isDowngradeToChannelId =
        feed.feedUrl.includes("playlist_id=UULF") &&
        (fetched.discoveredFeedUrl.includes("channel_id=UC") ||
          fetched.discoveredFeedUrl.includes("playlist_id=UU"));

      if (!isDowngradeToChannelId) {
        updatePayload.feedUrl = fetched.discoveredFeedUrl;
      }
    }

    db.update(feeds).set(updatePayload).where(eq(feeds.id, feedId)).run();

    logger.sync(
      "SyncEngine",
      `✓ Successfully synced "${feed.title}": ${newItemsCount} new, ${updatedDatesCount} dates updated (${durationMs}ms)`,
      {
        feedId,
        newArticles: newItemsCount,
        updatedDates: updatedDatesCount,
        totalFetched: fetched.items.length,
        durationMs,
      }
    );

    // Auto-hydrate new articles in background if feed has autoFullFetch enabled
    if (feed.autoFullFetch && newItemsCount > 0) {
      (async () => {
        try {
          const { extractReadableContent } = await import("./readability-extractor");
          const recentItems = db
            .select()
            .from(feedItems)
            .where(eq(feedItems.feedId, feedId))
            .orderBy(desc(feedItems.createdAt))
            .limit(newItemsCount)
            .all();

          for (const itm of recentItems) {
            if ((!itm.isFullFetched || feed.autoFullFetch) && itm.mediaType === "article") {
              try {
                const extracted = await extractReadableContent(itm.url);
                if (extracted && extracted.contentHtml && extracted.contentHtml.length > 50) {
                  db.update(feedItems)
                    .set({
                      fullContentHtml: extracted.contentHtml,
                      fullContentMarkdown: extracted.contentMarkdown,
                      isFullFetched: true,
                    })
                    .where(eq(feedItems.id, itm.id))
                    .run();
                }
              } catch {
                // Ignore individual background extraction errors
              }
            }
          }
        } catch (e) {
          logger.warn("SyncEngine", `Background auto-hydration error for feed "${feed.title}":`, {
            error: String(e),
          });
        }
      })();
    }

    if (feed.feedUrl.includes("youtube.com")) {
      purgeYouTubeShorts();
    }

    return {
      feedId,
      title: feed.title,
      healthy: true,
      status: "updated",
      newItemsCount,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const currentErrors = (feed.errorCount || 0) + 1;
    const errorMsg = err.message || "Network request failed";

    db.update(feeds)
      .set({
        errorCount: currentErrors,
        lastError: errorMsg,
        lastFetchedAt: new Date(),
      })
      .where(eq(feeds.id, feedId))
      .run();

    logger.error("SyncEngine", `⚠ Failed syncing "${feed.title}": ${errorMsg} (${durationMs}ms)`, {
      feedId,
      url: feed.feedUrl,
      errorCount: currentErrors,
      durationMs,
    });

    return {
      feedId,
      title: feed.title,
      healthy: false,
      status: "error",
      newItemsCount: 0,
      durationMs,
      error: errorMsg,
    };
  }
}

export async function syncAllFeeds(options?: {
  concurrency?: number;
  forceAll?: boolean;
}): Promise<SyncBatchSummary> {
  if (isSyncRunning) {
    logger.warn("SyncEngine", "Sync batch is already in progress, skipping concurrent trigger");
    return {
      totalFeeds: 0,
      healthyCount: 0,
      errorCount: 0,
      newArticlesTotal: 0,
      durationMs: 0,
    };
  }

  isSyncRunning = true;
  const startTime = Date.now();

  try {
    const allFeeds = db
      .select({
        id: feeds.id,
        title: feeds.title,
        feedUrl: feeds.feedUrl,
        lastFetchedAt: feeds.lastFetchedAt,
      })
      .from(feeds)
      .all();
    const totalFeeds = allFeeds.length;
    const requestedConcurrency = options?.concurrency || 10;
    const forceAll = !!options?.forceAll;

    const isYouTube = (url: string) => url.includes("youtube.com") || url.includes("youtu.be");

    // Adaptive Intervals: 25 minutes for RSS/news, 2 hours for YouTube
    const STANDARD_INTERVAL_MS = 25 * 60 * 1000;
    const YOUTUBE_INTERVAL_MS = 2 * 60 * 60 * 1000;

    const isEligible = (f: (typeof allFeeds)[0]) => {
      if (forceAll) return true;
      if (!f.lastFetchedAt) return true;
      const elapsed = startTime - new Date(f.lastFetchedAt).getTime();
      return elapsed >= (isYouTube(f.feedUrl) ? YOUTUBE_INTERVAL_MS : STANDARD_INTERVAL_MS);
    };

    const eligibleFeeds = allFeeds.filter(isEligible);
    const adaptiveSkippedCount = totalFeeds - eligibleFeeds.length;

    const standardFeeds = eligibleFeeds.filter((f) => !isYouTube(f.feedUrl));
    const youtubeFeeds = eligibleFeeds.filter((f) => isYouTube(f.feedUrl));

    // Dedicate majority of workers to fast standard RSS feeds, and a small pool to throttled YouTube
    const standardConcurrency = Math.min(
      Math.max(1, requestedConcurrency - 2),
      Math.max(1, standardFeeds.length)
    );
    const youtubeConcurrency = Math.min(2, Math.max(1, youtubeFeeds.length));

    logger.sync(
      "SyncEngine",
      `🚀 Starting batch sync for ${eligibleFeeds.length}/${totalFeeds} feeds (${standardFeeds.length} standard [pool: ${standardConcurrency}], ${youtubeFeeds.length} YouTube [pool: ${youtubeConcurrency}], ${adaptiveSkippedCount} fresh/skipped${forceAll ? " [forced]" : ""})...`
    );

    let healthyCount = 0;
    let errorCount = 0;
    let newArticlesTotal = 0;
    let processed = 0;

    const runWorkerPool = (feedList: typeof allFeeds, poolSize: number): Promise<void>[] => {
      let nextIndex = 0;
      const count = Math.min(poolSize, feedList.length);
      return Array.from({ length: count }, async () => {
        while (nextIndex < feedList.length) {
          const index = nextIndex++;
          const f = feedList[index];
          try {
            const res = await syncSingleFeed(f.id);
            if (res.healthy) healthyCount++;
            else errorCount++;
            newArticlesTotal += res.newItemsCount;
          } catch {
            errorCount++;
          } finally {
            processed++;
            if (processed % 25 === 0 || processed === eligibleFeeds.length) {
              logger.info(
                "SyncEngine",
                `Progress: ${processed}/${eligibleFeeds.length} feeds processed (${newArticlesTotal} new articles so far)`
              );
            }
            // Yield to Node.js event loop so health probes and user requests are not starved
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      });
    };

    const standardWorkers = runWorkerPool(standardFeeds, standardConcurrency);
    const youtubeWorkers = runWorkerPool(youtubeFeeds, youtubeConcurrency);

    await Promise.all([...standardWorkers, ...youtubeWorkers]);

    const durationMs = Date.now() - startTime;

    lastSyncTelemetry = {
      lastSyncAt: new Date(startTime),
      durationMs,
      totalFeeds,
      standardFeedsChecked: standardFeeds.length,
      youtubeFeedsChecked: youtubeFeeds.length,
      adaptiveSkippedCount,
      healthyCount,
      errorCount,
      newArticlesTotal,
      nextScheduledAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    logger.sync(
      "SyncEngine",
      `🏁 Completed sync in ${(durationMs / 1000).toFixed(1)}s: ${healthyCount} healthy, ${errorCount} errors, ${newArticlesTotal} new articles ingested (${adaptiveSkippedCount} skipped).`,
      {
        totalFeeds,
        eligibleCount: eligibleFeeds.length,
        adaptiveSkippedCount,
        healthyCount,
        errorCount,
        newArticlesTotal,
        durationSeconds: Number((durationMs / 1000).toFixed(1)),
      }
    );

    // Trigger non-blocking atomic backup snapshot if new articles were ingested
    if (newArticlesTotal > 0) {
      import("./backup-service")
        .then(({ createDatabaseBackup }) => createDatabaseBackup())
        .catch((e) =>
          logger.warn("SyncEngine", `Automated post-sync backup skipped: ${e.message}`)
        );
    }

    // Purge any YouTube Shorts that slipped through before completing batch
    if (youtubeFeeds.length > 0) {
      purgeYouTubeShorts();
    }

    return {
      totalFeeds: eligibleFeeds.length,
      healthyCount,
      errorCount,
      newArticlesTotal,
      durationMs,
    };
  } finally {
    isSyncRunning = false;
  }
}

export function isBatchSyncInProgress() {
  return isSyncRunning;
}

export async function batchHydratePendingItems(options?: {
  feedId?: string;
  limit?: number;
}): Promise<{ totalFound: number; hydrated: number; failed: number }> {
  const maxLimit = options?.limit ?? 50;
  const { extractReadableContent } = await import("./readability-extractor");

  const query = db
    .select({
      id: feedItems.id,
      url: feedItems.url,
      title: feedItems.title,
      feedId: feedItems.feedId,
      feedTitle: feeds.title,
    })
    .from(feedItems)
    .innerJoin(feeds, eq(feedItems.feedId, feeds.id))
    .where(
      and(
        eq(feedItems.isFullFetched, false),
        or(ne(feedItems.mediaType, "video"), isNull(feedItems.mediaType)),
        options?.feedId ? eq(feedItems.feedId, options.feedId) : eq(feeds.autoFullFetch, true)
      )
    )
    .orderBy(desc(feedItems.publishedAt))
    .limit(maxLimit);

  const items = query.all();
  let hydrated = 0;
  let failed = 0;

  logger.info(
    "BatchHydrate",
    `Found ${items.length} unhydrated articles in auto-fetch subscriptions...`
  );

  for (const itm of items) {
    try {
      const extracted = await extractReadableContent(itm.url);
      if (extracted && extracted.contentHtml && extracted.contentHtml.length > 50) {
        db.update(feedItems)
          .set({
            fullContentHtml: extracted.contentHtml,
            fullContentMarkdown: extracted.contentMarkdown,
            isFullFetched: true,
          })
          .where(eq(feedItems.id, itm.id))
          .run();
        hydrated++;
      } else {
        failed++;
      }
    } catch (err: any) {
      failed++;
      logger.warn("BatchHydrate", `Failed to auto-hydrate "${itm.title}": ${err.message}`);
    }
    // Rate-limit throttle between requests
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.sync(
    "BatchHydrate",
    `Completed batch hydration: ${hydrated} hydrated, ${failed} failed.`,
    {
      totalFound: items.length,
      hydrated,
      failed,
    }
  );

  return { totalFound: items.length, hydrated, failed };
}

export interface RehydrateSummary {
  totalTargeted: number;
  cleanedStoredCount: number;
  refetchedCount: number;
  videosTaggedCount: number;
  entitiesDecodedCount: number;
  durationMs: number;
}

export async function rehydrateAndCleanTargetedSources(options?: {
  refetch?: boolean;
  limit?: number;
  sinceHours?: number;
}): Promise<RehydrateSummary> {
  const startTime = Date.now();
  const limit = options?.limit ?? 1000;
  const shouldRefetch = options?.refetch ?? false;
  const sinceHours = options?.sinceHours;
  const { cleanArticleHtml, cleanArticleMarkdown } = await import("@/lib/utils/clean-article");
  const { decodeHtmlEntities } = await import("@/lib/utils/decode");
  const { extractReadableContent } = await import("./readability-extractor");

  const targetKeywords = [
    "%thehackernews%",
    "%theregister%",
    "%bleepingcomputer%",
    "%arstechnica%",
    "%darkreading%",
    "%techtarget%",
    "%openai.com%",
    "%youtube.com%",
    "%youtu.be%",
    "%substack%",
    "%crankysec%",
    "%lowyinstitute%",
    "%foreignaffairs%",
    "%marginalrevolution%",
  ];

  const keywordConditions = or(
    ...targetKeywords.map((k) => sql`${feedItems.url} LIKE ${k}`),
    ...targetKeywords.map((k) => sql`${feeds.feedUrl} LIKE ${k}`),
    sql`${feedItems.author} LIKE '%@%'`,
    sql`${feedItems.author} LIKE '%www.%'`,
    sql`${feedItems.author} LIKE '%- Articles%'`,
    sql`${feedItems.fullContentMarkdown} IS NULL AND length(${feedItems.fullContentHtml}) > 200`,
    sql`(${feedItems.fullContentMarkdown} IS NULL OR length(${feedItems.fullContentMarkdown}) < 50) AND ${feedItems.mediaType} = 'article'`,
    sql`(${feedItems.fullContentHtml} IS NULL OR length(${feedItems.fullContentHtml}) < 50) AND ${feedItems.mediaType} = 'article'`,
    sql`${feedItems.snippet} IS NULL OR length(${feedItems.snippet}) = 0`
  );

  let whereConditions = keywordConditions;
  if (sinceHours && sinceHours > 0) {
    const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    whereConditions = or(
      gte(feedItems.publishedAt, sinceDate),
      gte(feedItems.createdAt, sinceDate)
    );
  }

  const items = db
    .select({
      id: feedItems.id,
      url: feedItems.url,
      title: feedItems.title,
      author: feedItems.author,
      snippet: feedItems.snippet,
      fullContentHtml: feedItems.fullContentHtml,
      fullContentMarkdown: feedItems.fullContentMarkdown,
      isFullFetched: feedItems.isFullFetched,
      videoId: feedItems.videoId,
      mediaType: feedItems.mediaType,
    })
    .from(feedItems)
    .innerJoin(feeds, eq(feedItems.feedId, feeds.id))
    .where(whereConditions)
    .orderBy(desc(feedItems.publishedAt), desc(feedItems.createdAt))
    .limit(limit)
    .all();

  let cleanedStoredCount = 0;
  let refetchedCount = 0;
  let videosTaggedCount = 0;
  let entitiesDecodedCount = 0;

  logger.info(
    "Rehydrate",
    `Starting rehydration & cleaning for ${items.length} targeted articles...`
  );

  for (const item of items) {
    let needsUpdate = false;
    const updatePayload: any = {};

    // 0. Clean & sanitize author
    if (item.author) {
      const cleaned = cleanAuthor(item.author);
      if (cleaned !== item.author) {
        updatePayload.author = cleaned;
        needsUpdate = true;
      }
    }

    // 1. YouTube video detection and mediaType segregation
    const isYt = item.url.includes("youtube.com") || item.url.includes("youtu.be");
    if (isYt) {
      const match = item.url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      const vid = match ? match[1] : undefined;
      if (vid && item.videoId !== vid) {
        updatePayload.videoId = vid;
        needsUpdate = true;
      }
      if (item.mediaType !== "video") {
        updatePayload.mediaType = "video";
        needsUpdate = true;
        videosTaggedCount++;
      }
    }

    // 2. Decode raw HTML entities in title & snippet
    if (item.title && /&(?:#\d+|amp|quot|lt|gt|#39|apos);/i.test(item.title)) {
      const decodedTitle = decodeHtmlEntities(item.title);
      if (decodedTitle !== item.title) {
        updatePayload.title = decodedTitle;
        needsUpdate = true;
        entitiesDecodedCount++;
      }
    }
    if (item.snippet && /&(?:#\d+|amp|quot|lt|gt|#39|apos);/i.test(item.snippet)) {
      const decodedSnippet = decodeHtmlEntities(item.snippet);
      if (decodedSnippet !== item.snippet) {
        updatePayload.snippet = decodedSnippet;
        needsUpdate = true;
      }
    }

    // 2b. Synthesize missing snippet from content
    if (!item.snippet || item.snippet.trim().length === 0) {
      const rawText = (item.fullContentHtml || item.fullContentMarkdown || "")
        .replace(/<[^>]*>?/gm, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (rawText.length > 0) {
        updatePayload.snippet = decodeHtmlEntities(rawText.slice(0, 300));
        needsUpdate = true;
      }
    }

    // 3. Clean stored Markdown and HTML in-place (never overwrite with empty content)
    if (item.fullContentMarkdown) {
      const cleanedMd = cleanArticleMarkdown(item.fullContentMarkdown, item.title);
      if (cleanedMd && cleanedMd.length > 50 && cleanedMd !== item.fullContentMarkdown) {
        updatePayload.fullContentMarkdown = cleanedMd;
        needsUpdate = true;
      }
    }
    if (item.fullContentHtml) {
      const cleanedHtml = cleanArticleHtml(item.fullContentHtml);
      if (cleanedHtml && cleanedHtml.length > 50 && cleanedHtml !== item.fullContentHtml) {
        updatePayload.fullContentHtml = cleanedHtml;
        needsUpdate = true;
      }
    }

    // 3b. If Markdown is missing but rich HTML is present, convert to clean Markdown
    if (
      !item.fullContentMarkdown &&
      item.fullContentHtml &&
      item.fullContentHtml.length > 200 &&
      !isYt
    ) {
      try {
        const rawMd = turndown.turndown(item.fullContentHtml);
        const cleanedMd = cleanArticleMarkdown(rawMd, item.title);
        if (cleanedMd && cleanedMd.length > 200) {
          updatePayload.fullContentMarkdown = cleanedMd;
          if (cleanedMd.length >= 800) {
            updatePayload.isFullFetched = true;
          }
          needsUpdate = true;
        }
      } catch {
        // ignore
      }
    }

    const hasCorruptOrEmptyContent =
      !item.fullContentHtml ||
      item.fullContentHtml.length < 50 ||
      !item.fullContentMarkdown ||
      item.fullContentMarkdown.length < 50;

    // 4. If refetch is requested OR if article has no full content yet OR content was stripped/corrupted
    if (shouldRefetch || (!item.isFullFetched && !isYt) || (hasCorruptOrEmptyContent && !isYt)) {
      try {
        const extracted = await extractReadableContent(item.url);
        if (extracted && extracted.contentHtml && extracted.contentHtml.length > 50) {
          updatePayload.fullContentHtml = extracted.contentHtml;
          updatePayload.fullContentMarkdown = extracted.contentMarkdown;
          updatePayload.isFullFetched = true;
          if (extracted.videoId && !item.videoId) {
            updatePayload.videoId = extracted.videoId;
            updatePayload.mediaType = "video";
          }
          needsUpdate = true;
          refetchedCount++;
        }
      } catch (err: any) {
        logger.warn("Rehydrate", `Failed to re-fetch "${item.title}": ${err.message}`);
      }
    }

    if (needsUpdate) {
      db.update(feedItems).set(updatePayload).where(eq(feedItems.id, item.id)).run();
      cleanedStoredCount++;
    }
  }

  const durationMs = Date.now() - startTime;
  logger.sync("Rehydrate", `Finished rehydrating ${items.length} items in ${durationMs}ms`, {
    totalTargeted: items.length,
    cleanedStoredCount,
    refetchedCount,
    videosTaggedCount,
    entitiesDecodedCount,
    durationMs,
  });

  return {
    totalTargeted: items.length,
    cleanedStoredCount,
    refetchedCount,
    videosTaggedCount,
    entitiesDecodedCount,
    durationMs,
  };
}

/**
 * Purges YouTube Shorts from the database across URL, title, snippet, and content matches.
 */
export function purgeYouTubeShorts(): { deletedCount: number } {
  try {
    const shortsStmt = sqlite.prepare(`
      DELETE FROM feed_items
      WHERE (
        url LIKE '%/shorts/%'
        OR lower(title) LIKE '%#shorts%'
        OR lower(title) LIKE '%#short%'
        OR lower(title) LIKE '%#ytshorts%'
        OR (
          (media_type = 'video' OR video_id IS NOT NULL OR url LIKE '%youtube%')
          AND (
            lower(coalesce(snippet, '')) LIKE '%#shorts%'
            OR lower(coalesce(snippet, '')) LIKE '%#short%'
            OR lower(coalesce(snippet, '')) LIKE '%#ytshorts%'
            OR lower(coalesce(snippet, '')) LIKE '%/shorts/%'
            OR lower(coalesce(full_content_html, '')) LIKE '%#shorts%'
            OR lower(coalesce(full_content_html, '')) LIKE '%#short%'
            OR lower(coalesce(full_content_html, '')) LIKE '%/shorts/%'
          )
        )
      )
    `);
    const result = shortsStmt.run();
    if (result.changes > 0) {
      logger.info("SyncEngine", `Purged ${result.changes} YouTube Shorts from feed_items`);
    }
    return { deletedCount: result.changes };
  } catch (err: any) {
    logger.warn("SyncEngine", `purgeYouTubeShorts failed: ${err.message}`);
    return { deletedCount: 0 };
  }
}
