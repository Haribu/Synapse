import { NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { readingSessions, feedItems } from "@/lib/db/schema";
import { createDatabaseBackup } from "@/lib/services/backup-service";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const fortyEightHoursAgo = nowSec - 48 * 60 * 60;

    // 1. Take a pre-reset safety backup snapshot
    await createDatabaseBackup();

    // 2. Clear all logged reading sessions
    db.delete(readingSessions).run();

    // 3. Mark items published in the last 48 hours as unread (0)
    // Mark older archive items as read (1)
    // Zero out engagement duration and flags
    const result = sqlite
      .prepare(
        `
      UPDATE feed_items 
      SET is_read = CASE 
            WHEN coalesce(published_at, created_at) >= ? THEN 0 
            ELSE 1 
          END,
          is_engaged_read = 0,
          read_duration_seconds = 0
    `
      )
      .run(fortyEightHoursAgo);

    // 4. Count newly unread items
    const unreadCountRow = sqlite
      .prepare("SELECT count(*) as count FROM feed_items WHERE is_read = 0")
      .get() as { count: number };

    const totalItemsRow = sqlite.prepare("SELECT count(*) as count FROM feed_items").get() as {
      count: number;
    };

    // 5. Take post-reset clean snapshot
    const postBackup = await createDatabaseBackup();

    return NextResponse.json({
      status: "ok",
      message: "v1.0.0 Production Reset Completed Successfully",
      resetMetrics: {
        totalArticles: totalItemsRow.count,
        unreadArticlesLast48Hours: unreadCountRow.count,
        archivedReadArticles: totalItemsRow.count - unreadCountRow.count,
        readingSessionsCleared: true,
        engagementMetricsZeroed: true,
      },
      postBackup,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
