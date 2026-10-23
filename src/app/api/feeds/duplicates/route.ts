import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds, feedItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Normalizes a feed URL to its canonical form for deduplication:
 * - Lowercases protocol & hostname
 * - Strips trailing slashes
 * - Strips common tracking/format query parameters (e.g. ?format=xml, ?utm_*)
 */
function normalizeFeedUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    // Strip common tracking and cache-busting params
    const cleanParams = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      if (!key.startsWith("utm_") && key !== "format" && key !== "view") {
        cleanParams.append(key, val);
      }
    }
    const search = cleanParams.toString() ? `?${cleanParams.toString()}` : "";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}${pathname}${search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

interface DuplicateGroup {
  normalizedKey: string;
  reason: "same_url" | "same_title_domain";
  primaryFeed: any;
  duplicateFeeds: any[];
}

/**
 * GET /api/feeds/duplicates
 * Scans all feeds in the database and groups duplicates together.
 */
export async function GET() {
  try {
    const allFeeds = db
      .select({
        id: feeds.id,
        title: feeds.title,
        feedUrl: feeds.feedUrl,
        siteUrl: feeds.siteUrl,
        category: feeds.category,
        feedType: feeds.feedType,
        editorialType: feeds.editorialType,
        totalArticles: sql<number>`count(${feedItems.id})`.as("total_articles"),
        unreadCount: sql<number>`count(case when ${feedItems.isRead} = 0 then 1 else null end)`.as(
          "unread_count"
        ),
        createdAt: feeds.createdAt,
      })
      .from(feeds)
      .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
      .groupBy(feeds.id)
      .all();

    const groupsByUrl = new Map<string, any[]>();
    const groupsByDomainTitle = new Map<string, any[]>();

    for (const feed of allFeeds) {
      const normUrl = normalizeFeedUrl(feed.feedUrl);
      if (!groupsByUrl.has(normUrl)) {
        groupsByUrl.set(normUrl, []);
      }
      groupsByUrl.get(normUrl)!.push(feed);

      // Also check for exact same title + host domain (e.g. "Splunk Blogs")
      try {
        const host = new URL(feed.feedUrl).hostname.replace(/^www\./, "");
        const cleanTitle = feed.title.trim().toLowerCase();
        const domainTitleKey = `${host}:::${cleanTitle}`;
        if (!groupsByDomainTitle.has(domainTitleKey)) {
          groupsByDomainTitle.set(domainTitleKey, []);
        }
        groupsByDomainTitle.get(domainTitleKey)!.push(feed);
      } catch {}
    }

    const duplicates: DuplicateGroup[] = [];
    const processedFeedIds = new Set<string>();

    // 1. Group by normalized URL
    for (const [normUrl, feedList] of groupsByUrl.entries()) {
      if (feedList.length > 1) {
        // Sort: feed with most articles or older creation date is primary
        feedList.sort((a, b) => (b.totalArticles || 0) - (a.totalArticles || 0));
        const [primary, ...dupes] = feedList;
        duplicates.push({
          normalizedKey: normUrl,
          reason: "same_url",
          primaryFeed: primary,
          duplicateFeeds: dupes,
        });
        feedList.forEach((f) => processedFeedIds.add(f.id));
      }
    }

    // 2. Group by same domain + title (if not already handled)
    for (const [key, feedList] of groupsByDomainTitle.entries()) {
      const unhandled = feedList.filter((f) => !processedFeedIds.has(f.id));
      if (unhandled.length > 1) {
        unhandled.sort((a, b) => (b.totalArticles || 0) - (a.totalArticles || 0));
        const [primary, ...dupes] = unhandled;
        duplicates.push({
          normalizedKey: key,
          reason: "same_title_domain",
          primaryFeed: primary,
          duplicateFeeds: dupes,
        });
        unhandled.forEach((f) => processedFeedIds.add(f.id));
      }
    }

    return NextResponse.json({
      totalDuplicates: duplicates.length,
      duplicates,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/feeds/duplicates
 * Merges duplicate feeds into primary feeds:
 * - Reassigns all feedItems from duplicate feeds to the primary feed.
 * - Deletes the duplicate feed rows.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { primaryFeedId, duplicateFeedIds } = body;

    if (!primaryFeedId || !Array.isArray(duplicateFeedIds) || duplicateFeedIds.length === 0) {
      return NextResponse.json(
        { error: "primaryFeedId and duplicateFeedIds array are required" },
        { status: 400 }
      );
    }

    let mergedItemsCount = 0;

    for (const dupeId of duplicateFeedIds) {
      if (dupeId === primaryFeedId) continue;

      // Reassign all feedItems from dupeId to primaryFeedId
      try {
        const result = db
          .update(feedItems)
          .set({ feedId: primaryFeedId })
          .where(eq(feedItems.feedId, dupeId))
          .run();
        mergedItemsCount += result.changes || 0;
      } catch {
        // If there are duplicate GUIDs, delete duplicate items first
        db.delete(feedItems).where(eq(feedItems.feedId, dupeId)).run();
      }

      // Delete the duplicate feed
      db.delete(feeds).where(eq(feeds.id, dupeId)).run();
    }

    return NextResponse.json({
      success: true,
      primaryFeedId,
      deletedFeedIds: duplicateFeedIds,
      mergedItemsCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
