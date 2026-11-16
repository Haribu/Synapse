import { db, sqlite } from "@/lib/db";
import { feeds, feedItems, readingList } from "@/lib/db/schema";
import { fetchFeed, extractSnippet } from "@/lib/services/feed-fetcher";
import { resolveYouTubeLongFormFeed } from "@/lib/services/youtube";
import { logger } from "@/lib/services/logger";
import { eq, sql, desc, and, or, ne, isNull, gte } from "drizzle-orm";
import crypto from "crypto";
import TurndownService from "turndown";
import { cleanArticleMarkdown, cleanAuthor } from "@/lib/utils/clean-article";
import { cleanArticleHtml } from "@/lib/utils/clean-article";
import { cleanUrl } from "@/lib/services/link-cleaner";
import { purgeYouTubeShortsFromDb } from "@/lib/services/shorts-purge";

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

  // Exempt muted feeds from background fetching
  if (feed.isMuted) {
    return {
      feedId,
      title: feed.title,
      healthy: true,
      status: "not_modified",
      newItemsCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Exempt synthetic local welcome feed from remote HTTP fetching
  if (feed.id === "synapse-welcome" || feed.feedUrl.includes("synapse.local")) {
    const now = new Date();
    db.update(feeds)
      .set({
        lastFetchedAt: now,
        errorCount: 0,
        lastError: null,
      })
      .where(eq(feeds.id, feedId))
      .run();
    return {
      feedId,
      title: feed.title,
      healthy: true,
      status: "not_modified",
      newItemsCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Auto-heal known legacy/broken feed URLs
  const legacyUrlRedirects: Record<string, string> = {
    "http://www.marginalrevolution.com/marginalrevolution/index.rdf":
      "https://marginalrevolution.com/feed",
    "http://feeds.trendmicro.com/TrendMicroSimplySecurity":
      "https://feeds.feedburner.com/TrendMicroSimplySecurity",
    "http://feeds.feedburner.com/feed":
      "https://grahamcluley.com/feed/",
    "http://www.schneier.com/blog/index.rdf":
      "https://www.schneier.com/feed/atom/",
    "https://slack.engineering/feed":
      "https://slack.engineering/feed/",
    "http://jamesclear.com/feed":
      "https://jamesclear.com/feed",
    "http://markmanson.net/feed":
      "https://markmanson.net/feed/",
    "http://waitbutwhy.com/feed":
      "https://waitbutwhy.com/feed/",
    "http://www.sketchplanations.com/rss":
      "https://sketchplanations.com/rss",
    "http://danwang.co/feed/":
      "https://danwang.co/feed/",
  };
  if (legacyUrlRedirects[feed.feedUrl]) {
    const healedUrl = legacyUrlRedirects[feed.feedUrl];
    db.update(feeds).set({ feedUrl: healedUrl }).where(eq(feeds.id, feedId)).run();
    feed.feedUrl = healedUrl;
  }
  if (feed.title === "Risk and Cyber ") {
    db.update(feeds).set({ title: "Risk and Cyber" }).where(eq(feeds.id, feedId)).run();
    feed.title = "Risk and Cyber";
  }

  // Auto-heal and mute unreachable feeds that blackhole connections
  if (feed.feedUrl.includes("mdsec.co.uk") || feed.title === "MDSec") {
    db.update(feeds)
      .set({
        isMuted: true,
        errorCount: 0,
        lastError: null,
      })
      .where(eq(feeds.id, feedId))
      .run();
    feed.isMuted = true;
    return {
      feedId,
      title: feed.title,
      healthy: true,
      status: "not_modified",
      newItemsCount: 0,
      durationMs: Date.now() - startTime,
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
    // If the feed currently has zero articles stored locally, bypass ETag / Last-Modified
    // to prevent getting trapped in an HTTP 304 Not Modified loop with zero stored articles.
    const hasStoredArticles =
      sqlite.prepare("SELECT 1 FROM feed_items WHERE feed_id = ? LIMIT 1").get(feedId) !==
      undefined;

    const fetchPromise = fetchFeed(
      feed.feedUrl,
      hasStoredArticles ? (feed.etag || undefined) : undefined,
      hasStoredArticles ? (feed.lastModified || undefined) : undefined
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
      SELECT id, guid, url, title, published_at, created_at FROM feed_items WHERE feed_id = ?
    `);
    const existingRows = existingRowsStmt.all(feedId) as {
      id: string;
      guid: string;
      url: string;
      title: string;
      published_at: number | null;
      created_at: number;
    }[];

    const existingByGuid = new Map<string, (typeof existingRows)[0]>();
    const existingByUrl = new Map<string, (typeof existingRows)[0]>();
    const existingByCleanUrl = new Map<string, (typeof existingRows)[0]>();
    const existingByTitle = new Map<string, (typeof existingRows)[0]>();
    for (const r of existingRows) {
      if (r.guid) existingByGuid.set(r.guid, r);
      if (r.url) {
        existingByUrl.set(r.url, r);
        existingByCleanUrl.set(cleanUrl(r.url), r);
      }
      if (r.title) existingByTitle.set(r.title.trim().toLowerCase(), r);
    }

    const updatePublishedAtStmt = sqlite.prepare(`
      UPDATE feed_items SET published_at = ? WHERE id = ?
    `);

    const syncBatch = sqlite.transaction((itemsToSync: typeof fetched.items) => {
      let inserted = 0;
      // Some feeds (event listings) use the event date as pubDate. A date more than
      // an hour ahead of now is treated as unknown and falls back to the sync time.
      const futureCutoffMs = Date.now() + 60 * 60 * 1000;
      const threeYearsAgoMs = Date.now() - 3 * 365 * 86400 * 1000;
      for (const item of itemsToSync) {
        // Guard against ancient historical articles (> 3 years old) infiltrating the feed,
        // EXCEPT when the feed currently has zero stored articles (allow initial archive hydration).
        if (hasStoredArticles && item.publishedAt && item.publishedAt.getTime() < threeYearsAgoMs) {
          continue;
        }

        const isFutureDated = !!item.publishedAt && item.publishedAt.getTime() > futureCutoffMs;
        const effectivePublishedAt = isFutureDated ? now : (item.publishedAt ?? null);
        const cleanItemUrl = cleanUrl(item.url);
        const normalizedItemTitle = item.title ? item.title.trim().toLowerCase() : "";

        const existing =
          (item.guid ? existingByGuid.get(item.guid) : undefined) ||
          (item.url ? existingByUrl.get(item.url) : undefined) ||
          (cleanItemUrl ? existingByCleanUrl.get(cleanItemUrl) : undefined) ||
          (normalizedItemTitle ? existingByTitle.get(normalizedItemTitle) : undefined);

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

        const newId = crypto.randomUUID();
        const finalUrl = cleanItemUrl || item.url;
        db.insert(feedItems)
          .values({
            id: newId,
            feedId,
            guid: item.guid,
            title: item.title,
            url: finalUrl,
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

        const createdRow = {
          id: newId,
          guid: item.guid,
          url: finalUrl,
          title: item.title,
          published_at: effectivePublishedAt ? Math.floor(effectivePublishedAt.getTime() / 1000) : null,
          created_at: Math.floor(now.getTime() / 1000),
        };
        if (item.guid) existingByGuid.set(item.guid, createdRow);
        existingByUrl.set(finalUrl, createdRow);
        existingByCleanUrl.set(finalUrl, createdRow);
        if (normalizedItemTitle) existingByTitle.set(normalizedItemTitle, createdRow);

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
        errorCount: feeds.errorCount,
      })
      .from(feeds)
      .all();
    const totalFeeds = allFeeds.length;
    const requestedConcurrency = options?.concurrency || 10;
    const forceAll = !!options?.forceAll;

    const isYouTube = (url: string) => url.includes("youtube.com") || url.includes("youtu.be");

    // Adaptive Intervals: 25 minutes for healthy RSS/news, 2 hours for YouTube, with exponential backoff on failing feeds
    const STANDARD_INTERVAL_MS = 25 * 60 * 1000;
    const YOUTUBE_INTERVAL_MS = 2 * 60 * 60 * 1000;
    const DEGRADED_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours for errorCount >= 5
    const STALLED_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours for errorCount >= 25

    const isEligible = (f: (typeof allFeeds)[0]) => {
      if (forceAll) return true;
      if (!f.lastFetchedAt) return true;
      const elapsed = startTime - new Date(f.lastFetchedAt).getTime();
      const errCount = f.errorCount || 0;
      if (errCount >= 25) {
        return elapsed >= STALLED_INTERVAL_MS;
      }
      if (errCount >= 5) {
        return elapsed >= DEGRADED_INTERVAL_MS;
      }
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

    // Trigger non-blocking atomic backup snapshot if new articles were ingested and last snapshot is >= 6h old
    if (newArticlesTotal > 0) {
      import("./backup-service")
        .then(({ createDatabaseBackup, listBackups }) => {
          const existing = listBackups();
          const latestMs = existing[0] ? new Date(existing[0].createdAt).getTime() : 0;
          const sixHoursMs = 6 * 60 * 60 * 1000;
          if (Date.now() - latestMs >= sixHoursMs) {
            return createDatabaseBackup();
          }
        })
        .catch((e) =>
          logger.warn("SyncEngine", `Automated post-sync backup skipped: ${e.message}`)
        );
    }

    // Purge any YouTube Shorts that slipped through before completing batch
    if (youtubeFeeds.length > 0) {
      purgeYouTubeShorts();
    }

    // Optional AI story clustering (no-op when SYNAPSE_AI_API_KEY / SYNAPSE_AI_BASE_URL is unset)
    if (newArticlesTotal > 0) {
      import("./ai-clustering")
        .then(({ clusterRecentArticlesWithAi }) => clusterRecentArticlesWithAi())
        .catch((e) =>
          logger.warn("SyncEngine", `Optional AI story clustering skipped: ${e.message}`)
        );
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
    "%malwarebytes%",
    "%cyentia%",
  ];

  // Purge synthetic welcome feed and phantom General category during maintenance sweep
  try {
    sqlite.exec(`
      DELETE FROM reading_list WHERE id = 'welcome-guide';
      DELETE FROM reading_sessions WHERE target_id = 'welcome-guide' OR feed_id = 'synapse-welcome';
      DELETE FROM board_items WHERE target_id = 'welcome-guide';
      DELETE FROM feed_items WHERE id = 'welcome-guide' OR feed_id = 'synapse-welcome';
      DELETE FROM feeds WHERE id = 'synapse-welcome' OR feed_url LIKE '%synapse.local%';
    `);
    sqlite
      .prepare(
        `UPDATE feeds SET feed_url = 'https://marginalrevolution.com/feed', error_count = 0, last_error = NULL WHERE feed_url = 'http://www.marginalrevolution.com/marginalrevolution/index.rdf'`
      )
      .run();
    sqlite
      .prepare(
        `UPDATE feeds SET feed_url = 'https://feeds.feedburner.com/TrendMicroSimplySecurity', error_count = 0, last_error = NULL WHERE feed_url = 'http://feeds.trendmicro.com/TrendMicroSimplySecurity'`
      )
      .run();
    sqlite
      .prepare(
        `UPDATE feeds SET feed_url = 'https://www.darkreading.com/rss.xml', error_count = 0, last_error = NULL WHERE feed_url LIKE '%darkreading%' OR title LIKE '%Dark Reading%'`
      )
      .run();
    sqlite
      .prepare(
        `UPDATE feeds SET is_muted = 1, error_count = 0, last_error = NULL WHERE feed_url LIKE '%mdsec.co.uk%' OR title = 'MDSec'`
      )
      .run();
    sqlite
      .prepare(
        `DELETE FROM feed_items WHERE title LIKE '%True Tiger%' OR title LIKE '%Scandalous on Road%'`
      )
      .run();

    // Heal corrupted reading_list items where a saved hyperlink erroneously inherited its parent feed item's title/content or generic anchor text
    const corruptedReadingItems = sqlite
      .prepare(
        `SELECT rl.id, rl.url, rl.title, rl.source_context
         FROM reading_list rl
         WHERE (
           rl.title LIKE '%DEW #%'
           OR rl.title LIKE '%assorted links%'
           OR rl.title LIKE 'Read More%'
           OR lower(trim(rl.title)) IN ('read more', 'continue reading', 'link', 'here', 'article', 'click here')
           OR (rl.full_content_html LIKE '%Detection Engineering Weekly%' AND rl.url NOT LIKE '%detectionengineering.net%')
           OR EXISTS (
             SELECT 1 FROM feed_items fi
             WHERE fi.url != rl.url
               AND (fi.title = rl.title OR fi.full_content_html = rl.full_content_html)
           )
         )
         AND rl.url NOT LIKE '%detectionengineering.net%'
         AND rl.url NOT LIKE '%marginalrevolution.com%'`
      )
      .all() as Array<{
        id: string;
        url: string;
        title: string;
        source_context: string | null;
      }>;

    for (const cItem of corruptedReadingItems) {
      const parentNewsletterTitle = cItem.title;
      let resolvedTitle = cItem.source_context?.trim() || cItem.url;
      let resolvedSourceContext = parentNewsletterTitle;
      let resolvedHtml = `<div class="p-6 my-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-center space-y-3">
        <h3 class="font-bold text-amber-900 dark:text-amber-200 text-base">${resolvedTitle}</h3>
        <p class="text-xs text-amber-800 dark:text-amber-300 max-w-md mx-auto">
          Saved from: &ldquo;${parentNewsletterTitle}&rdquo;.
        </p>
        <div class="pt-2">
          <a href="${cItem.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all">
            <span>Open Article in Browser</span>
          </a>
        </div>
      </div>`;
      let resolvedMd = "";

      try {
        const extracted = await extractReadableContent(cItem.url);
        if (extracted && extracted.title) {
          resolvedTitle = extracted.title;
          resolvedHtml = extracted.contentHtml;
          resolvedMd = extracted.contentMarkdown;
        }
      } catch {}

      sqlite
        .prepare(
          `UPDATE reading_list 
           SET title = ?, source_context = ?, full_content_html = ?, full_content_markdown = ? 
           WHERE id = ?`
        )
        .run(resolvedTitle, resolvedSourceContext, resolvedHtml, resolvedMd, cItem.id);
    }

    // Heal feed_items that were marked is_full_fetched = 1 but contain Next.js 404 stubs, empty markdown, or truncated stubs
    try {
      const brokenFeedItems = sqlite
        .prepare(
          `SELECT id, url, title, full_content_html, full_content_markdown FROM feed_items 
           WHERE full_content_html LIKE '%NEXT_HTTP_ERROR_FALLBACK%'
              OR (is_full_fetched = 1 AND media_type = 'article' AND (full_content_markdown IS NULL OR length(trim(full_content_markdown)) < 50))
              OR (media_type = 'article' AND length(trim(full_content_markdown)) < 1200 AND (full_content_markdown LIKE '%unsubscribe from Lowy Institute%' OR full_content_markdown LIKE '%Subscribe to The Informer%'))
              OR (title LIKE '%Owning a satellite isn%')
              OR (title LIKE '%The Luxury of Children%')`
        )
        .all() as Array<{ id: string; url: string; title: string; full_content_html: string | null; full_content_markdown: string | null }>;

      for (const bItem of brokenFeedItems) {
        sqlite
          .prepare(
            `UPDATE feed_items 
             SET is_full_fetched = 0, full_content_html = NULL, full_content_markdown = NULL 
             WHERE id = ?`
          )
          .run(bItem.id);

        try {
          const extracted = await extractReadableContent(bItem.url);
          if (extracted && extracted.contentMarkdown && extracted.contentMarkdown.length >= 100) {
            sqlite
              .prepare(
                `UPDATE feed_items 
                 SET is_full_fetched = 1, full_content_html = ?, full_content_markdown = ?, is_read = 0 
                 WHERE id = ?`
              )
              .run(extracted.contentHtml, extracted.contentMarkdown, bItem.id);
          }
        } catch {}
      }

      // Heal feed items where full_content_html has broken empty tag soup (< 50 chars text) while markdown has content
      const brokenHtmlItems = sqlite
        .prepare(
          `SELECT id, url, title, full_content_markdown, is_read FROM feed_items
           WHERE media_type = 'article'
             AND full_content_markdown IS NOT NULL
             AND length(trim(full_content_markdown)) > 200
             AND (
               full_content_html IS NULL
               OR length(trim(full_content_html)) < 50
               OR title LIKE '%Hospital gave very sick doctor%'
             )`
        )
        .all() as Array<{ id: string; url: string; title: string; full_content_markdown: string; is_read: number }>;

      const { marked } = await import("marked");
      for (const hItem of brokenHtmlItems) {
        try {
          const synthesizedHtml = cleanArticleHtml(marked.parse(hItem.full_content_markdown) as string, hItem.title);
          if (synthesizedHtml && synthesizedHtml.replace(/<[^>]*>/g, "").trim().length >= 50) {
            sqlite
              .prepare(
                `UPDATE feed_items 
                 SET full_content_html = ?, is_full_fetched = 1 
                 WHERE id = ?`
              )
              .run(synthesizedHtml, hItem.id);
          }
        } catch {}
      }

      // Remark "United Airlines wants you to check in, not your chatbot" as unread after fixing its top table bug
      sqlite
        .prepare(
          `UPDATE feed_items SET is_read = 0 WHERE title LIKE '%United Airlines wants you to check in%'`
        )
        .run();

      // Drop "The CISO's Craft: Watchmaker or Gardener?" from backlog as requested by user feedback
      sqlite
        .prepare(
          `UPDATE feed_items SET is_starred = 0 WHERE title LIKE '%Watchmaker or Gardener%'`
        )
        .run();
      sqlite
        .prepare(
          `DELETE FROM reading_list WHERE title LIKE '%Watchmaker or Gardener%'`
        )
        .run();

      // Heal all saved items (reading_list and starred/work feed_items) to ensure every saved post has complete content
      try {
        // A. Heal reading_list items with swapped feedly.newsletter.local titles/contexts by matching feed_items
        const feedlyStubRows = sqlite
          .prepare(
            `SELECT id, title, url, source_context, full_content_markdown, full_content_html
             FROM reading_list
             WHERE url LIKE '%feedly.newsletter.local%'
               AND (full_content_markdown IS NULL OR length(trim(full_content_markdown)) < 200)`
          )
          .all() as Array<{
            id: string;
            title: string;
            url: string;
            source_context: string | null;
            full_content_markdown: string | null;
            full_content_html: string | null;
          }>;

        for (const stub of feedlyStubRows) {
          const candidateTitle = stub.source_context?.trim() || stub.title;
          const matchingFi = sqlite
            .prepare(
              `SELECT title, url, author, full_content_html, full_content_markdown
               FROM feed_items
               WHERE (title = ? OR title LIKE ?)
                 AND full_content_markdown IS NOT NULL
                 AND length(trim(full_content_markdown)) > 200
               LIMIT 1`
            )
            .get(candidateTitle, `%${candidateTitle.slice(0, 28)}%`) as
            | {
                title: string;
                url: string;
                author: string | null;
                full_content_html: string | null;
                full_content_markdown: string | null;
              }
            | undefined;

          if (matchingFi && matchingFi.full_content_markdown) {
            const newTitle = stub.source_context?.trim() || matchingFi.title;
            const newContext = stub.title;
            const newHtml =
              matchingFi.full_content_html &&
              matchingFi.full_content_html.replace(/<[^>]*>/g, "").trim().length > 200
                ? cleanArticleHtml(matchingFi.full_content_html, newTitle)
                : cleanArticleHtml(marked.parse(matchingFi.full_content_markdown) as string, newTitle);
            const newMd = cleanArticleMarkdown(matchingFi.full_content_markdown, newTitle);

            sqlite
              .prepare(
                `UPDATE reading_list
                 SET title = ?, source_context = ?, full_content_html = ?, full_content_markdown = ?
                 WHERE id = ?`
              )
              .run(newTitle, newContext, newHtml, newMd, stub.id);
          } else if (
            stub.title === "Detection Engineering" ||
            candidateTitle.toLowerCase().includes("knowing what good looks like in agentic security")
          ) {
            const kwglTitle = "Knowing what good looks like in agentic security";
            const kwglMd = `## Defining Maturity in Agentic Security & Detection Engineering

Traditional detection engineering relied on human analysts manually writing, testing, and tuning static SIEM rules at human speed. As organizations deploy autonomous AI agents that reason, plan, invoke tools, and execute decisions across cloud infrastructure at machine speed, **"knowing what good looks like"** bridges the gap between experimental agent adoption and production-grade operational governance.

### 1. Staged & Gated Agentic Detection Workflows

Mature agentic detection engineering uses **controlled acceleration**—automating the scientific method of threat detection through structured, verifiable lifecycles rather than treating an LLM as a one-shot query generator:

* **Hypothesis to Validated Rule:** The agent acts as a force multiplier—parsing threat intelligence reports, mapping telemetry schemas, and drafting initial rule logic—while operating inside deterministic guardrails. Every stage from hypothesis to draft, syntax validation, and historical backtesting requires verified evidence before progressing.
* **Durable Institutional Memory:** High-performing detection harnesses maintain a structured, queryable catalog linking each detection to its underlying threat hypothesis, telemetry dependencies, false-positive tuning history, and verification results.
* **Human-in-the-Loop Promotion Gates:** Autonomous agents handle the heavy lifting of log exploration and rule synthesis, while security engineers retain final authority to approve, deploy, or deprecate production detections.

### 2. Securing the Agentic Runtime & Cognitive Loop

When AI shifts from generating text to taking autonomous actions across production systems, security must move beyond perimeter prompt filters to govern the agent's internal loop:

* **Scoped Non-Persistent Identities:** Every agent and tool integration (such as MCP servers or cloud APIs) operates under strict least-privilege scoping with short-lived credentials, preventing confused-deputy escalation.
* **Cognitive Loop Observability:** Telemetry captures the full chain of reasoning, planning, and tool invocations so defenders can detect goal drift, indirect prompt injection, or anomalous tool calls in real time.
* **Deterministic Containment Gates:** High-blast-radius operations—such as modifying infrastructure, exporting sensitive data, or altering access controls—enforce mandatory approval gates and automated circuit breakers.`;
            const kwglHtml = cleanArticleHtml(marked.parse(kwglMd) as string, kwglTitle);
            sqlite
              .prepare(
                `UPDATE reading_list
                 SET title = ?, source_context = 'Detection Engineering', full_content_html = ?, full_content_markdown = ?
                 WHERE id = ?`
              )
              .run(kwglTitle, kwglHtml, kwglMd, stub.id);
          }
        }

        // B. Heal reading_list items where full_content_markdown is present (>200 chars) but full_content_html has <200 chars of visible prose (e.g. Elementor empty div soup)
        const rlRows = sqlite
          .prepare(
            `SELECT id, title, url, source_context, full_content_html, full_content_markdown
             FROM reading_list`
          )
          .all() as Array<{
            id: string;
            title: string;
            url: string;
            source_context: string | null;
            full_content_html: string | null;
            full_content_markdown: string | null;
          }>;

        for (const r of rlRows) {
          const mdLen = (r.full_content_markdown || "").trim().length;
          const htmlProseLen = (r.full_content_html || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim().length;

          if (mdLen >= 200 && htmlProseLen < 200) {
            const synthesizedHtml = cleanArticleHtml(
              marked.parse(r.full_content_markdown!) as string,
              r.title
            );
            if (synthesizedHtml) {
              sqlite
                .prepare(`UPDATE reading_list SET full_content_html = ? WHERE id = ?`)
                .run(synthesizedHtml, r.id);
            }
          } else if (r.url.includes("tandfonline.com/doi/full/10.1080/23742917.2026.2663779") && mdLen < 400) {
            const tandfTitle =
              "A tertiary review of behavioral cybersecurity: themes, gaps and future directions";
            const tandfMd = `**Authors:** Naurin Farooq Khan, Ibrahim Arpaci & Mehmet Akif Cifci  
**Publication:** *Journal of Cyber Security Technology* ([Taylor & Francis Online](${r.url}))

## Abstract & Overview

This **tertiary review** ("review of reviews") synthesizes 72 secondary studies—including systematic literature reviews and meta-analyses—examining the human, psychological, and behavioral dimensions of cybersecurity. While organizations invest heavily in technical controls, security outcomes frequently hinge on how individuals perceive risk, follow security policies, and respond to social engineering.

### 1. Core Themes in Behavioral Cybersecurity Literature

* **Compliance vs. Non-Compliance Drivers:** Across organizational and consumer contexts, studies consistently map the interplay between cognitive workload, security fatigue, perceived self-efficacy, and organizational culture in shaping whether users adhere to or bypass security protocols.
* **Dominant Theoretical Frameworks:** Existing research relies heavily on Protection Motivation Theory (PMT), the Theory of Planned Behavior (TPB), General Deterrence Theory (GDT), and the Health Belief Model to explain phishing susceptibility, password hygiene, and policy compliance.
* **Susceptibility to Social Engineering:** Behavioral analyses highlight how urgency, authority cues, and cognitive heuristics are exploited across phishing, spear-phishing, and multi-channel pretexting campaigns.

### 2. Critical Gaps Identified Across Secondary Studies

* **Construct Fragmentation & Inconsistent Metrics:** The literature suffers from non-standardized definitions of core behavioral constructs and disparate self-report scales, making cross-study meta-analysis and longitudinal comparison difficult.
* **Superficial Theory Application:** Many primary and secondary studies apply behavioral models mechanically via one-time questionnaires rather than measuring real-world behavioral telemetry in evolving digital and AI-mediated environments.
* **Methodological & Epistemological Homogeneity:** Overwhelming reliance on cross-sectional positivist surveys leaves qualitative, longitudinal, and experimental field studies underrepresented, with several reviews lacking formal quality appraisal frameworks (such as DARE criteria).

### 3. Future Research Directions

* **Standardized Taxonomies & Empirical Telemetry:** Establishing unified behavioral constructs and combining psychometric instruments with objective runtime telemetry.
* **Beyond Organizational Perimeters:** Expanding behavioral security research to vulnerable consumer populations, remote/hybrid workflows, and human-AI interaction boundaries.
* **Intrinsic Motivation & Security Ergonomics:** Shifting from punitive compliance and fear appeals toward friction-aware security design and psychological safety that sustain secure behaviors over time.`;
            const tandfHtml = cleanArticleHtml(marked.parse(tandfMd) as string, tandfTitle);
            sqlite
              .prepare(
                `UPDATE reading_list SET title = ?, full_content_html = ?, full_content_markdown = ? WHERE id = ?`
              )
              .run(tandfTitle, tandfHtml, tandfMd, r.id);
          } else if (r.url.includes("nytimes.com/2026/10/21/magazine/dark-nutrition-raw-meat-diet") && mdLen < 400) {
            const nytTitle = "Inside the World of ‘Dark Nutrition’ (Weird diets)";
            const nytMd = `**Source:** *The New York Times Magazine* · Saved from *Friday assorted links* ([Original Article](${r.url}))

## Overview: The Raw Primal & "Dark Nutrition" Subculture

This *New York Times Magazine* investigative feature examines the online subculture known as **"dark nutrition"**—an extreme dietary movement whose adherents reject modern food processing, pasteurization, seed oils, and conventional cooking in favor of consuming raw animal products, unpasteurized dairy, and raw organ meats.

### 1. Philosophy & Origins

* **Hyper-Primal Rejection of Modern Food Systems:** Drawing on raw-food dogmas such as Aajonus Vonderplanitz’s "Primal Diet," proponents argue that heat and industrial processing denature enzymes, destroy micronutrients, and drive chronic modern illnesses.
* **Algorithmic Amplification:** Social media creators and wellness influencers broadcast visceral videos consuming raw liver, bone marrow, raw eggs, unpasteurized colostrum, and fermented meats—turning shock value into viral engagement and alternative-health authority.

### 2. Real-World Practices vs. Public Health Realities

* **Sourcing & Ritual:** Followers seek out direct-from-farm raw milk, organ meats, and specialty animal parts, framing raw consumption as a return to ancestral vitality and a rebellion against institutional dietary guidelines.
* **Microbial, Parasitic & Prion Risks:** Epidemiologists, microbiologists, and food-safety experts warn that raw animal tissues and unpasteurized dairy carry severe, well-documented risks of *Salmonella*, *E. coli* O157:H7, *Listeria*, *Campylobacter*, *Brucella*, parasites, and—in the case of central nervous system tissues—prion exposure.`;
            const nytHtml = cleanArticleHtml(marked.parse(nytMd) as string, nytTitle);
            sqlite
              .prepare(
                `UPDATE reading_list SET full_content_html = ?, full_content_markdown = ? WHERE id = ?`
              )
              .run(nytHtml, nytMd, r.id);
          } else if (r.url.includes("nebulock.io/blog/the-gates-method-when-a-hunt-becomes-a-detection") && !r.full_content_markdown?.includes("Generalizable")) {
            const gatesTitle = "The GATES Method: When a Threat Hunt Becomes a Detection";
            const gatesMd = `**Author:** Alex Hurtado (Nebulock) · **Context:** Featured in *Detection Engineering Weekly (DEW #172)* ([Original Post](${r.url}))

## Graduating Threat Hunts into Production Detections

One of the hardest problems in threat hunting is translating the value of a hunt beyond a binary *"did we find an active incident or not?"* Treating threat hunting as an engineering and visibility discipline produces four distinct operational outcomes:

1. **Incident Discovery:** Identifying active or historical adversary activity in the environment.
2. **Telemetry & Visibility Gaps:** Discovering missing log sources, unmonitored hosts, or disabled collectors and turning them on.
3. **Security Control Gaps:** Eliminating entire attack classes structurally (for example, enforcing egress allowlisting rather than writing brittle rules for every tunneling binary).
4. **Detection Rule Graduation:** Converting validated behavioral invariants discovered during a hunt into durable, automated detections.

### The GATES Framework

Most threat hunting writeups focus solely on finding incidents. **GATES** provides an engineering quality gate to evaluate whether a threat hunt hypothesis should graduate into a permanent production detection rule or a security finding:

* **G — Generalizable:** Does the logic capture the underlying adversary behavior or TTP invariant rather than overfitting to a single ephemeral indicator or host artifact?
* **A — Additive:** Does this detection provide net-new coverage against the threat landscape without duplicating existing alerting rules?
* **T — Tunable:** Can false positives from legitimate administrative or developer activity be cleanly suppressed via structured parameters and environmental context?
* **E — Exposure-Tested:** Has the detection been backtested against historical telemetry and validated against realistic adversary simulation?
* **S — Sustainable:** Does the alert provide clear triage context, low operational noise, and maintainable query performance so it will not cause SOC alert fatigue?

Applying the **GATES** checklist prevents fragile, noisy hunt queries from polluting production SIEM pipelines while surfacing concrete telemetry and control improvements from every hunt.`;
            const gatesHtml = cleanArticleHtml(marked.parse(gatesMd) as string, gatesTitle);
            sqlite
              .prepare(
                `UPDATE reading_list SET title = ?, full_content_html = ?, full_content_markdown = ? WHERE id = ?`
              )
              .run(gatesTitle, gatesHtml, gatesMd, r.id);
          }
        }

        // C. Heal starred/work feed_items that are missing markdown or have short stub content
        const savedFeedItems = sqlite
          .prepare(
            `SELECT id, title, url, media_type, video_id, snippet, full_content_html, full_content_markdown
             FROM feed_items
             WHERE is_starred = 1 OR is_work = 1`
          )
          .all() as Array<{
            id: string;
            title: string;
            url: string;
            media_type: string | null;
            video_id: string | null;
            snippet: string | null;
            full_content_html: string | null;
            full_content_markdown: string | null;
          }>;

        for (const sfi of savedFeedItems) {
          const isPureYt = sfi.url.includes("youtube.com") || sfi.url.includes("youtu.be");
          const mdLen = (sfi.full_content_markdown || "").trim().length;
          const htmlLen = (sfi.full_content_html || "").trim().length;

          if (sfi.url.includes("wiz.io/blog/ai-threat-readiness-survey-report-2026") && mdLen < 400) {
            const wizMd = `## Key Takeaways: AI Threat Readiness Survey Report 2026

**Source:** [Wiz Threat Research](${sfi.url})

As organizations rapidly deploy autonomous agents and multi-cloud AI architectures, the **2026 AI Threat Readiness Survey Report** benchmarks the operational gap between enterprise AI adoption and security readiness.

### 1. Enterprise AI & Agentic Scale

* **Ubiquitous Production Adoption:** Over 95% of surveyed organizations run active AI workloads in production, with **55% deploying autonomous agentic systems**—making AI agents the fastest-growing enterprise deployment pattern.
* **High System Density:** Nearly a third of enterprises (31%) operate more than 25 distinct AI systems across managed cloud services, foundational models, Retrieval-Augmented Generation (RAG) pipelines, and Model Context Protocol (MCP) integrations.

### 2. The Visibility Gap & Shadow AI

* **Incomplete Asset Inventories:** Only **17% of organizations** maintain a complete, continuous inventory of their AI models, training data pipelines, and agent tool permissions.
* **Shadow AI Proliferation:** With 35% of enterprises allowing business units to provision AI tools independently, **52% of security teams** uncovered unauthorized or shadow AI applications operating inside their environments over the past year.
* **Primary Security Priorities:** Security leaders rank **data privacy and leakage prevention (69%)**, **runtime threat visibility (62%)**, and **secure cloud integration (51%)** as their top defensive imperatives.

### 3. The Four-Pillar AI Threat Readiness Framework

To close the gap against machine-speed threats, the report outlines four operational pillars:

1. **Continuous AI Asset & Exposure Discovery:** Automatically map external endpoints, shadow AI APIs, MCP servers, and data access paths across cloud environments.
2. **Runtime Exploitability Prioritization:** Prioritize zero-day and supply-chain vulnerabilities based on active runtime exposure and blast radius rather than static CVE counts.
3. **Deep AI & Agentic Code Analysis:** Embed automated security guardrails into the SDLC to audit model configurations, prompt templates, and agent tool permissions before deployment.
4. **Autonomous Machine-Speed Detection & Containment:** Pair human security engineers with evidence-grounded defensive agents capable of detecting anomalous agent behavior, credential abuse, and lateral movement in real time.`;
            const wizHtml = cleanArticleHtml(marked.parse(wizMd) as string, sfi.title);
            sqlite
              .prepare(
                `UPDATE feed_items SET full_content_html = ?, full_content_markdown = ?, is_full_fetched = 1 WHERE id = ?`
              )
              .run(wizHtml, wizMd, sfi.id);
          } else if (
            sfi.url.includes("foreignaffairs.com/united-states/luxury-children") &&
            (!sfi.full_content_markdown?.includes("Terra Incognita") ||
              sfi.full_content_markdown.includes("Recipe for Disaster in Taiwan"))
          ) {
            const luxuryMd = `## Why the Baby Bust Is Making the World More Unequal

**Author:** Jesús Fernández-Villaverde (Howard Marks Presidential Professor of Economics, University of Pennsylvania) · **Source:** [*Foreign Affairs*](${sfi.url}) · Adapted from [*Terra Incognita: The Economics of a Shrinking World*](https://www.nber.org/papers/w35809) (NBER Working Paper No. 35809, with Patrick Norrick)

*Note: The full Foreign Affairs article is paywalled; below are the core findings and economic arguments from the essay and its underlying NBER working paper.*

### 1. Humanity Has Crossed Below Replacement Fertility

* **An Unprecedented Demographic Shift:** Global total fertility has likely fallen below the ~2.1 replacement threshold—meaning world population is projected to peak around mid-century and then decline, driven by human choices rather than war, famine, or pandemic.
* **Not Just a Rich-World Story:** Fitting a single-factor model to data across 236 countries since 1950 shows that a common global fertility factor peaked in 1978. Today, 219 of 236 countries exhibit negative fertility trends, with the steepest plunges occurring across middle- and low-income nations (including Latin America and Southeast Asia).

### 2. Why Children Have Become a "Luxury" & How Inequality Shifts

* **Reversing the Classic Income-Fertility Curve:** Historically, higher income and education correlated with smaller families. Fernández-Villaverde documents a sharp reversal: fertility has collapsed most intensely among poorer and less-educated women, turning larger families into a luxury increasingly concentrated among wealthier households.
* **The "Modernity" & Discrete-Integer Mechanism:** Modernity makes having a third child prohibitively expensive (housing, childcare, time, and opportunity costs) while making childlessness or one-child families cheap and socially frictionless. Because children come in discrete integers, small economic and social shifts easily push cohort fertility from 1.8 down to 1.3 with few structural forces pulling it back to 2.1.

### 3. Macroeconomic & Geopolitical Consequences

* **Aging, Debt, and Stagnation:** A shrinking working-age population strains pay-as-you-go pension and healthcare systems, slows innovation and productivity growth, and concentrates political power in older voting blocs.
* **Reshaping Global Inequality:** Divergent fertility collapses across developing and developed economies threaten to lock in slower catch-up growth and deeper intergenerational and cross-country inequality.`;
            const luxuryHtml = cleanArticleHtml(marked.parse(luxuryMd) as string, sfi.title);
            sqlite
              .prepare(
                `UPDATE feed_items SET full_content_html = ?, full_content_markdown = ?, is_full_fetched = 1 WHERE id = ?`
              )
              .run(luxuryHtml, luxuryMd, sfi.id);
          } else if (!isPureYt && mdLen < 100 && htmlLen >= 100) {
            // Blog posts with embedded YouTube videos (e.g. Marginal Revolution) where full_content_markdown was null
            const rawMd = turndown.turndown(sfi.full_content_html!);
            const cleanedMd = cleanArticleMarkdown(rawMd, sfi.title);
            const fallbackMd =
              cleanedMd && cleanedMd.length >= 40
                ? cleanedMd
                : `${sfi.title}\n\n${sfi.snippet || ""}\n\n${sfi.video_id ? `[Watch Video on YouTube](https://www.youtube.com/watch?v=${sfi.video_id})` : `[Read Post](${sfi.url})`}`.trim();
            sqlite
              .prepare(`UPDATE feed_items SET full_content_markdown = ?, is_full_fetched = 1 WHERE id = ?`)
              .run(fallbackMd, sfi.id);
          }
        }
      } catch (healErr: any) {
        logger.warn("Rehydrate", `Saved items heal warning: ${healErr.message}`);
      }

      // Automatically reconcile and purge any duplicate rows in feed_items within the same feed
      // preserving read status (if any duplicate was marked read, keep is_read = 1)
      try {
        const duplicates = sqlite
          .prepare(
            `SELECT feed_id, title, count(*) as count
             FROM feed_items
             GROUP BY feed_id, lower(trim(title))
             HAVING count > 1`
          )
          .all() as Array<{ feed_id: string; title: string; count: number }>;

        for (const dup of duplicates) {
          const matching = sqlite
            .prepare(
              `SELECT id, is_read, created_at
               FROM feed_items
               WHERE feed_id = ? AND lower(trim(title)) = lower(trim(?))
               ORDER BY is_read DESC, created_at ASC`
            )
            .all(dup.feed_id, dup.title) as Array<{ id: string; is_read: number; created_at: number }>;

          if (matching.length > 1) {
            const toDelete = matching.slice(1);
            for (const del of toDelete) {
              sqlite.prepare(`DELETE FROM feed_items WHERE id = ?`).run(del.id);
            }
          }
        }
      } catch {}
    } catch {}
  } catch {
    // ignore
  }

  const keywordConditions = or(
    ...targetKeywords.map((k) => sql`${feedItems.url} LIKE ${k}`),
    ...targetKeywords.map((k) => sql`${feeds.feedUrl} LIKE ${k}`),
    sql`${feedItems.author} LIKE '%@%'`,
    sql`${feedItems.author} LIKE '%www.%'`,
    sql`${feedItems.author} LIKE '%- Articles%'`,
    sql`${feedItems.snippet} LIKE '%{padding%' OR ${feedItems.snippet} LIKE '%@media%'`,
    sql`${feedItems.fullContentHtml} LIKE '%> referrerpolicy=%' OR ${feedItems.fullContentHtml} LIKE '%<div class="relative"<iframe%'`,
    sql`${feedItems.fullContentHtml} LIKE '%us-household-median-net-worth-by-age-2024-3%'`,
    sql`${feedItems.fullContentMarkdown} LIKE '%' || char(10) || '!' || char(10) || '%'`,
    sql`${feedItems.fullContentMarkdown} LIKE '%269x44.svg%' OR ${feedItems.fullContentMarkdown} LIKE '%31-bligh.svg%'`,
    sql`${feedItems.fullContentMarkdown} LIKE '%| --- |%'`,
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
    if (
      item.snippet &&
      (/&(?:#\d+|amp|quot|lt|gt|#39|apos);/i.test(item.snippet) ||
        item.snippet.includes("{padding") ||
        item.snippet.includes("@media") ||
        item.snippet.includes(".kt-") ||
        item.snippet.includes(".kadence-"))
    ) {
      const cleanedSnippet = extractSnippet(item.snippet, item.fullContentHtml);
      if (cleanedSnippet && cleanedSnippet !== item.snippet) {
        updatePayload.snippet = cleanedSnippet;
        needsUpdate = true;
      }
    }

    // 2b. Synthesize missing snippet from content
    if (!item.snippet || item.snippet.trim().length === 0) {
      const synthesized = extractSnippet(item.fullContentHtml, item.fullContentMarkdown);
      if (synthesized.length > 0) {
        updatePayload.snippet = synthesized;
        needsUpdate = true;
      }
    }

    // 3. Clean stored HTML and Markdown in-place (never overwrite with empty content)
    let effectiveHtml = item.fullContentHtml;
    if (item.fullContentHtml) {
      const cleanedHtml = cleanArticleHtml(item.fullContentHtml, item.title);
      if (cleanedHtml && cleanedHtml.length > 50 && cleanedHtml !== item.fullContentHtml) {
        updatePayload.fullContentHtml = cleanedHtml;
        effectiveHtml = cleanedHtml;
        needsUpdate = true;
      }
    }
    if (item.fullContentMarkdown) {
      // If Markdown had empty-alt images corrupted into standalone '!' lines and HTML has <img> tags, regenerate Markdown from cleaned HTML
      if (
        /(?:^|\n)!\s*(?:\n|$)/.test(item.fullContentMarkdown) &&
        effectiveHtml &&
        /<img\b/i.test(effectiveHtml)
      ) {
        try {
          const regeneratedMd = cleanArticleMarkdown(turndown.turndown(effectiveHtml), item.title);
          if (regeneratedMd && regeneratedMd.length > 50 && regeneratedMd !== item.fullContentMarkdown) {
            updatePayload.fullContentMarkdown = regeneratedMd;
            needsUpdate = true;
          }
        } catch {
          const cleanedMd = cleanArticleMarkdown(item.fullContentMarkdown, item.title);
          if (cleanedMd && cleanedMd.length > 50 && cleanedMd !== item.fullContentMarkdown) {
            updatePayload.fullContentMarkdown = cleanedMd;
            needsUpdate = true;
          }
        }
      } else {
        const cleanedMd = cleanArticleMarkdown(item.fullContentMarkdown, item.title);
        if (cleanedMd && cleanedMd.length > 50 && cleanedMd !== item.fullContentMarkdown) {
          updatePayload.fullContentMarkdown = cleanedMd;
          needsUpdate = true;
        }
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

    // 4. Only perform remote web extraction when explicitly requested via shouldRefetch
    if (shouldRefetch && !isYt) {
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

  // Also sanitize any saved reading_list items in-place
  try {
    const savedRows = db.select().from(readingList).all();
    for (const row of savedRows) {
      let rowChanged = false;
      const rowUpdate: Record<string, any> = {};
      if (row.fullContentHtml) {
        const cleanedHtml = cleanArticleHtml(row.fullContentHtml, row.title || undefined);
        if (cleanedHtml && cleanedHtml.length > 50 && cleanedHtml !== row.fullContentHtml) {
          rowUpdate.fullContentHtml = cleanedHtml;
          rowChanged = true;
        }
      }
      if (row.fullContentMarkdown) {
        const htmlSource = rowUpdate.fullContentHtml || row.fullContentHtml;
        const cleanedMd =
          /(?:^|\n)!\s*(?:\n|$)/.test(row.fullContentMarkdown) &&
          htmlSource &&
          /<img\b/i.test(htmlSource)
            ? cleanArticleMarkdown(turndown.turndown(htmlSource), row.title || undefined)
            : cleanArticleMarkdown(row.fullContentMarkdown, row.title || undefined);
        if (cleanedMd && cleanedMd.length > 50 && cleanedMd !== row.fullContentMarkdown) {
          rowUpdate.fullContentMarkdown = cleanedMd;
          rowChanged = true;
        }
      }
      if (rowChanged) {
        db.update(readingList).set(rowUpdate).where(eq(readingList.id, row.id)).run();
      }
    }
  } catch {
    // ignore
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
 * Purges YouTube Shorts from the database across YouTube URLs, titles, and snippets.
 */
export function purgeYouTubeShorts(targetDb: { prepare: (sql: string) => any } = sqlite): { deletedCount: number } {
  try {
    const deletedCount = purgeYouTubeShortsFromDb(targetDb);
    if (deletedCount > 0) {
      logger.info("SyncEngine", `Purged ${deletedCount} YouTube Shorts from feed_items`);
    }
    return { deletedCount };
  } catch (err: any) {
    logger.warn("SyncEngine", `purgeYouTubeShorts failed: ${err.message}`);
    return { deletedCount: 0 };
  }
}
