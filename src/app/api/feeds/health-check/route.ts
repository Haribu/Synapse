import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { fetchFeed } from "@/lib/services/feed-fetcher";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { onlyUnreachable = false, limit = 50 } = body;

    let targetFeeds = db.select().from(feeds).all();

    if (onlyUnreachable) {
      targetFeeds = targetFeeds.filter((f) => (f.errorCount || 0) > 0);
    }

    targetFeeds = targetFeeds.slice(0, limit);

    let checked = 0;
    let healthyCount = 0;
    let errorCount = 0;
    const errors: { id: string; title: string; url: string; error: string }[] = [];

    // Concurrency limit: 5 feeds at a time
    const chunkSize = 5;
    for (let i = 0; i < targetFeeds.length; i += chunkSize) {
      const chunk = targetFeeds.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (feed) => {
          checked++;
          try {
            await fetchFeed(feed.feedUrl, feed.etag || undefined, feed.lastModified || undefined);

            db.update(feeds)
              .set({
                lastFetchedAt: new Date(),
                errorCount: 0,
                lastError: null,
              })
              .where(eq(feeds.id, feed.id))
              .run();

            healthyCount++;
          } catch (err: any) {
            errorCount++;
            const errorMsg = err.message || "Reachability failed";
            const newErrorCount = (feed.errorCount || 0) + 1;

            db.update(feeds)
              .set({
                errorCount: newErrorCount,
                lastError: errorMsg,
                lastFetchedAt: new Date(),
              })
              .where(eq(feeds.id, feed.id))
              .run();

            errors.push({
              id: feed.id,
              title: feed.title,
              url: feed.feedUrl,
              error: errorMsg,
            });
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      totalChecked: checked,
      healthyCount,
      errorCount,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
