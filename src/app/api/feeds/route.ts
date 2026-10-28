import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds, feedItems } from "@/lib/db/schema";
import { fetchFeed } from "@/lib/services/feed-fetcher";
import { resolveYouTubeLongFormFeed } from "@/lib/services/youtube";
import { eq, or, sql, desc } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

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
        autoFullFetch: feeds.autoFullFetch,
        isMuted: feeds.isMuted,
        isAuditWhitelisted: feeds.isAuditWhitelisted,
        errorCount: feeds.errorCount,
        lastError: feeds.lastError,
        lastFetchedAt: feeds.lastFetchedAt,
        createdAt: feeds.createdAt,
        totalArticles: sql<number>`count(${feedItems.id})`.as("total_articles"),
        unreadCount: sql<number>`count(case when ${feedItems.isRead} = 0 then 1 else null end)`.as(
          "unread_count"
        ),
        engagedCount:
          sql<number>`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`.as(
            "engaged_count"
          ),
        lastPostAt: sql<number | null>`max(${feedItems.publishedAt})`.as("last_post_at"),
      })
      .from(feeds)
      .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
      .groupBy(feeds.id)
      .orderBy(desc(feeds.createdAt))
      .all();

    return NextResponse.json({ feeds: allFeeds });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      feedUrl,
      category = "General",
      editorialType = "independent",
      autoFullFetch = false,
      title: customTitle,
    } = body;

    if (!feedUrl) {
      return NextResponse.json({ error: "feedUrl is required" }, { status: 400 });
    }

    const rawInputUrl = feedUrl.trim();
    // Fast check: if raw input URL matches an existing feed directly
    const existingBefore = db
      .select({
        id: feeds.id,
        title: feeds.title,
        category: feeds.category,
        feedUrl: feeds.feedUrl,
        siteUrl: feeds.siteUrl,
      })
      .from(feeds)
      .where(or(eq(feeds.feedUrl, rawInputUrl), eq(feeds.siteUrl, rawInputUrl)))
      .get();

    if (existingBefore) {
      return NextResponse.json(
        {
          error: `This feed is already subscribed as "${existingBefore.title}".`,
          collision: true,
          existingFeed: {
            id: existingBefore.id,
            title: existingBefore.title,
            category: existingBefore.category || "General",
            feedUrl: existingBefore.feedUrl,
            siteUrl: existingBefore.siteUrl || existingBefore.feedUrl,
          },
          feedId: existingBefore.id,
        },
        { status: 409 }
      );
    }

    const resolvedFeedUrl = await resolveYouTubeLongFormFeed(rawInputUrl);

    const fetched = await fetchFeed(resolvedFeedUrl);
    if (!fetched || (fetched.items.length === 0 && !fetched.title)) {
      return NextResponse.json(
        { error: "No valid RSS or Atom feed could be found or parsed from this URL." },
        { status: 400 }
      );
    }

    const feedId = crypto.randomUUID();
    const now = new Date();

    const actualFeedUrl = fetched.discoveredFeedUrl || resolvedFeedUrl;

    // Check if feed already exists (matching exact, normalized, or resolved URL)
    const existing = db
      .select({
        id: feeds.id,
        title: feeds.title,
        category: feeds.category,
        feedUrl: feeds.feedUrl,
        siteUrl: feeds.siteUrl,
      })
      .from(feeds)
      .where(
        or(
          eq(feeds.feedUrl, actualFeedUrl),
          eq(feeds.feedUrl, resolvedFeedUrl),
          eq(feeds.feedUrl, rawInputUrl),
          eq(feeds.siteUrl, rawInputUrl)
        )
      )
      .get();

    if (existing) {
      return NextResponse.json(
        {
          error: `This feed is already subscribed as "${existing.title}".`,
          collision: true,
          existingFeed: {
            id: existing.id,
            title: existing.title,
            category: existing.category || "General",
            feedUrl: existing.feedUrl,
            siteUrl: existing.siteUrl || existing.feedUrl,
          },
          feedId: existing.id,
        },
        { status: 409 }
      );
    }

    const isYouTube =
      actualFeedUrl.includes("youtube.com") ||
      actualFeedUrl.includes("yt") ||
      actualFeedUrl.includes("playlist_id") ||
      (fetched.items.length > 0 && fetched.items.every((it) => it.mediaType === "video"));

    const finalCategory = isYouTube && category === "General" ? "YouTube" : category;
    const finalTitle =
      customTitle && customTitle.trim().length > 0
        ? customTitle.trim()
        : fetched.title || "Untitled Feed";

    db.insert(feeds)
      .values({
        id: feedId,
        title: finalTitle,
        feedUrl: actualFeedUrl,
        siteUrl: fetched.siteUrl || actualFeedUrl,
        category: finalCategory,
        feedType: isYouTube ? "youtube" : "rss",
        editorialType,
        autoFullFetch,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        lastFetchedAt: now,
        errorCount: 0,
        lastError: null,
        createdAt: now,
      })
      .run();

    // Insert initial items
    for (const item of fetched.items.slice(0, 30)) {
      db.insert(feedItems)
        .values({
          id: crypto.randomUUID(),
          feedId,
          guid: item.guid,
          title: item.title,
          url: item.url,
          author: item.author,
          snippet: item.snippet,
          fullContentHtml: item.content,
          publishedAt: item.publishedAt,
          mediaType: item.mediaType,
          videoId: item.videoId,
          thumbnailUrl: item.thumbnailUrl,
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();
    }

    return NextResponse.json({ success: true, feedId, title: finalTitle });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
