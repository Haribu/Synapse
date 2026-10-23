import { NextResponse } from "next/server";
import { batchHydratePendingItems } from "@/lib/services/sync-engine";
import { db } from "@/lib/db";
import { feedItems, feeds } from "@/lib/db/schema";
import { and, eq, or, ne, isNull, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get("feedId");

    const pendingCount =
      db
        .select({ count: count() })
        .from(feedItems)
        .innerJoin(feeds, eq(feedItems.feedId, feeds.id))
        .where(
          and(
            eq(feedItems.isFullFetched, false),
            or(ne(feedItems.mediaType, "video"), isNull(feedItems.mediaType)),
            feedId ? eq(feedItems.feedId, feedId) : eq(feeds.autoFullFetch, true)
          )
        )
        .get()?.count || 0;

    return NextResponse.json({ pendingCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { feedId, limit } = body;

    const result = await batchHydratePendingItems({
      feedId: typeof feedId === "string" ? feedId : undefined,
      limit: typeof limit === "number" ? limit : 50,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
