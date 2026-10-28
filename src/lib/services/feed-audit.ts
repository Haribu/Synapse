import { db } from "@/lib/db";
import { feeds, feedItems, readingSessions } from "@/lib/db/schema";
import { eq, sql, desc, ne } from "drizzle-orm";
import { clusterRelatedArticles } from "@/lib/utils/clustering";
import { evaluateFeedNoise, FeedNoiseReasonKey } from "@/lib/utils/feed-noise";

export interface FeedAuditRecommendation {
  feedId: string;
  feedTitle: string;
  feedUrl: string;
  siteUrl?: string | null;
  category: string;
  editorialType: string;
  isMuted: boolean;
  isAuditWhitelisted: boolean;
  totalArticles: number;
  recentArticles: number;
  readCount: number;
  engagedCount: number;
  flickedCount: number;
  starredCount: number;
  totalDwellSeconds: number;
  avgDwellSeconds: number;
  lastPostAt: number | null;
  fatigueScore: number; // 0 to 100
  reasonKey: FeedNoiseReasonKey;
  reasonLabel: string;
  reasonDescription: string;
  duplicateStoryCount: number;
}

export interface FeedAuditResult {
  recommendations: FeedAuditRecommendation[];
  summary: {
    totalAudited: number;
    recommendedCount: number;
    loudExhaustionCount: number;
    duplicateCount: number;
    dormantCount: number;
    mutedCount: number;
    whitelistedCount: number;
    totalWastedArticles: number;
  };
  mutedFeeds: Array<{
    id: string;
    title: string;
    category: string;
    feedUrl: string;
    totalArticles: number;
  }>;
  whitelistedFeeds: Array<{
    id: string;
    title: string;
    category: string;
    feedUrl: string;
    totalArticles: number;
  }>;
}

/**
 * Computes diagnostic feed health and identifies loud, low-signal, or redundant feeds
 * that contribute to triage fatigue with minimal reading payoff.
 */
export async function getFeedAuditRecommendations(): Promise<FeedAuditResult> {
  const ninetyDaysAgoSec = Math.floor(Date.now() / 1000) - 90 * 86400;

  // 1. Fetch all non-synthetic feeds with aggregated statistics
  const feedStatsRows = db
    .select({
      id: feeds.id,
      title: feeds.title,
      feedUrl: feeds.feedUrl,
      siteUrl: feeds.siteUrl,
      category: feeds.category,
      editorialType: feeds.editorialType,
      isMuted: feeds.isMuted,
      isAuditWhitelisted: feeds.isAuditWhitelisted,
      errorCount: feeds.errorCount,
      lastError: feeds.lastError,
      lastFetchedAt: feeds.lastFetchedAt,
      createdAt: feeds.createdAt,
      totalArticles: sql<number>`count(${feedItems.id})`,
      recentArticles: sql<number>`count(case when ${feedItems.publishedAt} >= ${ninetyDaysAgoSec} or (${feedItems.publishedAt} is null and ${feedItems.createdAt} >= ${ninetyDaysAgoSec}) then 1 else null end)`,
      readCount: sql<number>`count(case when ${feedItems.isRead} = 1 then 1 else null end)`,
      engagedCount: sql<number>`count(case when ${feedItems.isEngagedRead} = 1 or ${feedItems.readDurationSeconds} >= 30 then 1 else null end)`,
      starredCount: sql<number>`count(case when ${feedItems.isStarred} = 1 then 1 else null end)`,
      totalDwellSeconds: sql<number>`coalesce(sum(${feedItems.readDurationSeconds}), 0)`,
      lastPostAt: sql<number | null>`max(${feedItems.publishedAt})`,
    })
    .from(feeds)
    .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
    .where(ne(feeds.id, "synapse-welcome"))
    .groupBy(feeds.id)
    .all();

  // 2. Fetch flick counts per feed from readingSessions
  const flickCountsRows = db
    .select({
      feedId: readingSessions.feedId,
      flickCount: sql<number>`count(case when ${readingSessions.action} = 'flick' or ${readingSessions.durationSeconds} < 10 then 1 else null end)`,
    })
    .from(readingSessions)
    .where(sql`${readingSessions.feedId} IS NOT NULL`)
    .groupBy(readingSessions.feedId)
    .all();

  const flickMap = new Map<string, number>();
  for (const row of flickCountsRows) {
    if (row.feedId) flickMap.set(row.feedId, Number(row.flickCount || 0));
  }

  // 3. Detect story clustering redundancy across feeds
  const duplicateCountsMap = new Map<string, number>();
  try {
    const recentClusterCandidateItems = db
      .select({
        id: feedItems.id,
        feedId: feedItems.feedId,
        title: feedItems.title,
        snippet: feedItems.snippet,
        fullContentMarkdown: feedItems.fullContentMarkdown,
        fullContentHtml: feedItems.fullContentHtml,
        publishedAt: feedItems.publishedAt,
        feedEditorialType: feeds.editorialType,
        isRead: feedItems.isRead,
        isEngagedRead: feedItems.isEngagedRead,
      })
      .from(feedItems)
      .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
      .where(
        sql`(${feedItems.publishedAt} >= ${ninetyDaysAgoSec} OR (${feedItems.publishedAt} IS NULL AND ${feedItems.createdAt} >= ${ninetyDaysAgoSec}))`
      )
      .orderBy(desc(feedItems.publishedAt))
      .limit(600)
      .all();

    if (recentClusterCandidateItems.length > 0) {
      const clusters = clusterRelatedArticles(
        recentClusterCandidateItems.map((item) => ({
          ...item,
          publishedAt: item.publishedAt ? new Date(item.publishedAt).getTime() : Date.now(),
        }))
      );

      for (const cluster of clusters) {
        if (cluster.relatedStories.length > 0) {
          for (const rel of cluster.relatedStories) {
            if (rel.feedId && rel.feedId !== cluster.primary.feedId) {
              const current = duplicateCountsMap.get(rel.feedId) || 0;
              duplicateCountsMap.set(rel.feedId, current + 1);
            }
          }
        }
      }
    }
  } catch (clusterErr) {
    console.warn("[FeedAudit] Duplicate clustering pass skipped:", clusterErr);
  }

  const recommendations: FeedAuditRecommendation[] = [];
  const mutedFeeds: FeedAuditResult["mutedFeeds"] = [];
  const whitelistedFeeds: FeedAuditResult["whitelistedFeeds"] = [];

  let loudExhaustionCount = 0;
  let duplicateCount = 0;
  let dormantCount = 0;
  let totalWastedArticles = 0;

  const now = Date.now();

  for (const row of feedStatsRows) {
    const isMuted = Boolean(row.isMuted);
    const isWhitelisted = Boolean(row.isAuditWhitelisted);

    if (isMuted) {
      mutedFeeds.push({
        id: row.id,
        title: row.title,
        category: row.category || "General",
        feedUrl: row.feedUrl,
        totalArticles: row.totalArticles,
      });
    }

    if (isWhitelisted) {
      whitelistedFeeds.push({
        id: row.id,
        title: row.title,
        category: row.category || "General",
        feedUrl: row.feedUrl,
        totalArticles: row.totalArticles,
      });
      continue; // Skip whitelisted feeds from active recommendations
    }

    const total = row.totalArticles;
    const recent = row.recentArticles;
    const read = row.readCount;
    const engaged = row.engagedCount;
    const starred = row.starredCount;
    const dwell = row.totalDwellSeconds;
    const flicked = flickMap.get(row.id) || 0;
    const duplicates = duplicateCountsMap.get(row.id) || 0;
    const avgDwell = read > 0 ? Math.round(dwell / read) : 0;

    let lastPostAgoDays = 0;
    if (row.lastPostAt) {
      const ts =
        typeof row.lastPostAt === "number"
          ? row.lastPostAt < 10000000000
            ? row.lastPostAt * 1000
            : row.lastPostAt
          : new Date(row.lastPostAt).getTime();
      lastPostAgoDays = Math.max(0, Math.floor((now - ts) / (1000 * 3600 * 24)));
    }

    const evaluation = evaluateFeedNoise({
      totalArticles: total,
      recentArticles: recent,
      readCount: read,
      engagedCount: engaged,
      flickedCount: flicked,
      starredCount: starred,
      avgDwellSeconds: avgDwell,
      duplicateStoryCount: duplicates,
      errorCount: row.errorCount || 0,
      lastError: row.lastError,
      lastPostAgoDays,
    });

    if (evaluation.isRecommended && evaluation.reasonKey) {
      recommendations.push({
        feedId: row.id,
        feedTitle: row.title,
        feedUrl: row.feedUrl,
        siteUrl: row.siteUrl,
        category: row.category || "General",
        editorialType: row.editorialType || "independent",
        isMuted,
        isAuditWhitelisted: isWhitelisted,
        totalArticles: total,
        recentArticles: recent,
        readCount: read,
        engagedCount: engaged,
        flickedCount: flicked,
        starredCount: starred,
        totalDwellSeconds: dwell,
        avgDwellSeconds: avgDwell,
        lastPostAt: row.lastPostAt,
        fatigueScore: evaluation.fatigueScore,
        reasonKey: evaluation.reasonKey,
        reasonLabel: evaluation.reasonLabel,
        reasonDescription: evaluation.reasonDescription,
        duplicateStoryCount: duplicates,
      });

      if (evaluation.reasonKey === "loud_exhaustion") loudExhaustionCount++;
      else if (evaluation.reasonKey === "pure_duplicate") duplicateCount++;
      else if (evaluation.reasonKey === "dormant_broken") dormantCount++;

      totalWastedArticles += recent || total;
    }
  }

  // Sort candidates by fatigue score descending (highest noise first)
  recommendations.sort((a, b) => b.fatigueScore - a.fatigueScore);

  return {
    recommendations,
    summary: {
      totalAudited: feedStatsRows.length,
      recommendedCount: recommendations.length,
      loudExhaustionCount,
      duplicateCount,
      dormantCount,
      mutedCount: mutedFeeds.length,
      whitelistedCount: whitelistedFeeds.length,
      totalWastedArticles,
    },
    mutedFeeds,
    whitelistedFeeds,
  };
}
