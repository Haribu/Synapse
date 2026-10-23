import { NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { feedItems, feeds, readingList } from "@/lib/db/schema";
import { eq, and, desc, sql, or, ne, isNull, isNotNull, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get("feedId");
    const category = searchParams.get("category");
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const starredOnly = searchParams.get("starredOnly") === "true";
    const workOnly = searchParams.get("workOnly") === "true";
    const videoOnly = searchParams.get("videoOnly") === "true";
    const textOnly = searchParams.get("textOnly") === "true";
    const search = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (search && search.trim().length > 0) {
      // Use SQLite FTS5 search
      const sanitized = search.replace(/["*]/g, "");
      const ftsResults = sqlite
        .prepare(
          `
          SELECT item_id FROM items_fts 
          WHERE items_fts MATCH ? 
          ORDER BY rank 
          LIMIT ? OFFSET ?
        `
        )
        .all(`${sanitized}*`, limit, offset) as { item_id: string }[];

      const itemIds = ftsResults.map((r) => r.item_id);
      if (itemIds.length === 0) {
        return NextResponse.json({ items: [] });
      }

      const items = db
        .select({
          id: feedItems.id,
          feedId: feedItems.feedId,
          feedTitle: feeds.title,
          feedCategory: feeds.category,
          feedEditorialType: feeds.editorialType,
          title: feedItems.title,
          url: feedItems.url,
          author: feedItems.author,
          snippet: feedItems.snippet,
          fullContentHtml: feedItems.fullContentHtml,
          fullContentMarkdown: feedItems.fullContentMarkdown,
          isFullFetched: feedItems.isFullFetched,
          mediaType: feedItems.mediaType,
          videoId: feedItems.videoId,
          thumbnailUrl: feedItems.thumbnailUrl,
          isRead: feedItems.isRead,
          isStarred: feedItems.isStarred,
          isWork: feedItems.isWork,
          workDispatchedAt: feedItems.workDispatchedAt,
          publishedAt: feedItems.publishedAt,
        })
        .from(feedItems)
        .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
        .where(
          sql`${feedItems.id} IN (${sql.join(
            itemIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .all();

      return NextResponse.json({ items });
    }

    const conditions = [];

    // Exclude any YouTube Shorts across all listing views
    conditions.push(
      sql`(${feedItems.url} NOT LIKE '%/shorts/%' AND lower(${feedItems.title}) NOT LIKE '%#shorts%' AND lower(${feedItems.title}) NOT LIKE '%#short%')`
    );

    if (feedId) {
      conditions.push(eq(feedItems.feedId, feedId));
    }
    if (category) {
      conditions.push(eq(feeds.category, category));
    }
    if (unreadOnly) {
      conditions.push(eq(feedItems.isRead, false));
    }
    if (starredOnly) {
      conditions.push(eq(feedItems.isStarred, true));
    }
    if (videoOnly) {
      conditions.push(
        or(
          eq(feedItems.mediaType, "video"),
          isNotNull(feedItems.videoId),
          sql`${feedItems.url} LIKE '%youtube.com%'`,
          sql`${feedItems.url} LIKE '%youtu.be%'`
        )
      );
    }
    if (textOnly) {
      conditions.push(
        and(
          or(ne(feedItems.mediaType, "video"), isNull(feedItems.mediaType)),
          isNull(feedItems.videoId),
          sql`(${feedItems.url} NOT LIKE '%youtube.com%' AND ${feedItems.url} NOT LIKE '%youtu.be%')`
        )
      );
    }
    if (workOnly) {
      const feedWork = db
        .select({
          id: feedItems.id,
          feedId: feedItems.feedId,
          feedTitle: feeds.title,
          feedCategory: feeds.category,
          feedEditorialType: feeds.editorialType,
          title: feedItems.title,
          url: feedItems.url,
          author: feedItems.author,
          snippet: feedItems.snippet,
          fullContentHtml: feedItems.fullContentHtml,
          fullContentMarkdown: feedItems.fullContentMarkdown,
          isFullFetched: feedItems.isFullFetched,
          mediaType: feedItems.mediaType,
          videoId: feedItems.videoId,
          thumbnailUrl: feedItems.thumbnailUrl,
          isRead: feedItems.isRead,
          isStarred: feedItems.isStarred,
          isWork: feedItems.isWork,
          workDispatchedAt: feedItems.workDispatchedAt,
          publishedAt: feedItems.publishedAt,
        })
        .from(feedItems)
        .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
        .where(eq(feedItems.isWork, true))
        .all();

      const rlWork = db
        .select()
        .from(readingList)
        .where(eq(readingList.isWork, true))
        .all()
        .map((rl) => ({
          id: rl.id,
          feedId: null,
          feedTitle: rl.sourceContext ? `Research: ${rl.sourceContext}` : "Research Inbox",
          feedCategory: "Research",
          feedEditorialType: "independent" as const,
          title: rl.title,
          url: rl.url,
          author: rl.sourceContext,
          snippet: rl.aiSummary,
          fullContentHtml: rl.fullContentHtml,
          fullContentMarkdown: rl.fullContentMarkdown,
          isFullFetched: true,
          mediaType: "article" as const,
          videoId: null,
          thumbnailUrl: null,
          isRead: true,
          isStarred: false,
          isWork: true,
          workDispatchedAt: rl.workDispatchedAt,
          publishedAt: rl.createdAt,
        }));

      const combined = [...feedWork, ...rlWork].sort((a, b) => {
        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

      return NextResponse.json({ items: combined.slice(offset, offset + limit) });
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = db
      .select({
        id: feedItems.id,
        feedId: feedItems.feedId,
        feedTitle: feeds.title,
        feedCategory: feeds.category,
        feedEditorialType: feeds.editorialType,
        title: feedItems.title,
        url: feedItems.url,
        author: feedItems.author,
        snippet: feedItems.snippet,
        fullContentHtml: feedItems.fullContentHtml,
        fullContentMarkdown: feedItems.fullContentMarkdown,
        isFullFetched: feedItems.isFullFetched,
        mediaType: feedItems.mediaType,
        videoId: feedItems.videoId,
        thumbnailUrl: feedItems.thumbnailUrl,
        isRead: feedItems.isRead,
        isStarred: feedItems.isStarred,
        isWork: feedItems.isWork,
        workDispatchedAt: feedItems.workDispatchedAt,
        publishedAt: feedItems.publishedAt,
      })
      .from(feedItems)
      .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
      .where(whereClause)
      .orderBy(desc(feedItems.publishedAt))
      .limit(limit)
      .offset(offset)
      .all();

    // If viewing starred articles (not videos) without feed/category constraints, include starred readingList items
    if (starredOnly && textOnly && !feedId && !category) {
      const rlStarred = db
        .select()
        .from(readingList)
        .where(eq(readingList.isStarred, true))
        .all()
        .map((rl) => ({
          id: rl.id,
          feedId: null,
          feedTitle: rl.sourceContext ? `Research: ${rl.sourceContext}` : "Research Inbox",
          feedCategory: "Research",
          feedEditorialType: "independent" as const,
          title: rl.title,
          url: rl.url,
          author: rl.sourceContext,
          snippet: rl.aiSummary,
          fullContentHtml: rl.fullContentHtml,
          fullContentMarkdown: rl.fullContentMarkdown,
          isFullFetched: true,
          mediaType: "article" as const,
          videoId: null,
          thumbnailUrl: null,
          isRead: rl.isRead ?? true,
          isStarred: true,
          isWork: rl.isWork ?? false,
          workDispatchedAt: rl.workDispatchedAt,
          publishedAt: rl.createdAt,
        }));

      if (rlStarred.length > 0) {
        const combined = [...items, ...rlStarred].sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });
        return NextResponse.json({ items: combined.slice(offset, offset + limit) });
      }
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ids, isRead, isStarred, isWork, workDispatchedAt, userNotes, tags } = body;

    const rawIds: string[] = Array.isArray(ids) ? ids : id ? [id] : [];
    const targetIds = rawIds.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "id or ids is required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof isRead === "boolean") updates.isRead = isRead;
    if (typeof isStarred === "boolean") updates.isStarred = isStarred;
    if (typeof isWork === "boolean") {
      updates.isWork = isWork;
      if (!isWork) updates.workDispatchedAt = null;
    }
    if (workDispatchedAt !== undefined) {
      updates.workDispatchedAt = workDispatchedAt ? new Date(workDispatchedAt) : null;
    }
    if (userNotes !== undefined) updates.userNotes = userNotes;
    if (tags !== undefined) {
      updates.tags = Array.isArray(tags) ? tags.join(",") : tags;
    }

    if (Object.keys(updates).length > 0) {
      db.update(feedItems).set(updates).where(inArray(feedItems.id, targetIds)).run();

      db.update(readingList).set(updates).where(inArray(readingList.id, targetIds)).run();
    }

    return NextResponse.json({ success: true, count: targetIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
