import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds, feedItems, readingList } from "@/lib/db/schema";
import { extractReadableContent } from "@/lib/services/readability-extractor";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feedItem = db.select().from(feedItems).where(eq(feedItems.id, id)).get();

    if (feedItem) {
      const extracted = await extractReadableContent(feedItem.url);

      if (!extracted || !extracted.contentHtml || extracted.contentHtml.length < 50) {
        return NextResponse.json(
          { error: "Could not extract readable article content" },
          { status: 422 }
        );
      }

      const updatePayload: any = {
        fullContentHtml: extracted.contentHtml,
        fullContentMarkdown: extracted.contentMarkdown,
        isFullFetched: true,
      };
      if (extracted.videoId && !feedItem.videoId) {
        updatePayload.videoId = extracted.videoId;
      }

      db.update(feedItems).set(updatePayload).where(eq(feedItems.id, id)).run();

      const feed = feedItem.feedId
        ? db.select().from(feeds).where(eq(feeds.id, feedItem.feedId)).get()
        : null;

      return NextResponse.json({
        success: true,
        title: extracted.title,
        contentMarkdown: extracted.contentMarkdown,
        contentHtml: extracted.contentHtml,
        feedId: feed?.id || null,
        feedTitle: feed?.title || null,
        autoFullFetch: Boolean(feed?.autoFullFetch),
      });
    }

    // Check reading_list (Research Inbox)
    const rlItem = db.select().from(readingList).where(eq(readingList.id, id)).get();
    if (rlItem) {
      const extracted = await extractReadableContent(rlItem.url);

      if (!extracted || !extracted.contentHtml || extracted.contentHtml.length < 50) {
        return NextResponse.json(
          { error: "Could not extract readable article content" },
          { status: 422 }
        );
      }

      db.update(readingList)
        .set({
          fullContentHtml: extracted.contentHtml,
          fullContentMarkdown: extracted.contentMarkdown,
        })
        .where(eq(readingList.id, id))
        .run();

      return NextResponse.json({
        success: true,
        title: extracted.title,
        contentMarkdown: extracted.contentMarkdown,
        contentHtml: extracted.contentHtml,
        feedId: null,
        feedTitle: rlItem.sourceContext || "Research Inbox",
        autoFullFetch: false,
      });
    }

    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
