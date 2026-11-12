import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds, feedItems, readingList } from "@/lib/db/schema";
import { extractReadableContent } from "@/lib/services/readability-extractor";
import { cleanArticleHtml } from "@/lib/utils/clean-article";
import { eq } from "drizzle-orm";
import { marked } from "marked";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feedItem = db.select().from(feedItems).where(eq(feedItems.id, id)).get();

    if (feedItem) {
      let extracted = await extractReadableContent(feedItem.url);

      // Fallback: If web extraction yielded insufficient HTML text (< 50 chars) but we already have substantive markdown,
      // synthesize clean HTML directly from stored markdown!
      const plainTextLen = extracted?.contentHtml?.replace(/<[^>]*>/g, "").trim().length || 0;
      if (
        (!extracted || !extracted.contentHtml || plainTextLen < 50) &&
        feedItem.fullContentMarkdown &&
        feedItem.fullContentMarkdown.trim().length >= 100
      ) {
        const synthHtml = cleanArticleHtml(marked.parse(feedItem.fullContentMarkdown) as string, feedItem.title);
        if (synthHtml && synthHtml.replace(/<[^>]*>/g, "").trim().length >= 50) {
          extracted = {
            title: feedItem.title,
            contentMarkdown: feedItem.fullContentMarkdown,
            contentHtml: synthHtml,
          };
        }
      }

      const finalPlainLen = extracted?.contentHtml?.replace(/<[^>]*>/g, "").trim().length || 0;
      if (!extracted || !extracted.contentHtml || finalPlainLen < 50) {
        let domain = "";
        try {
          domain = new URL(feedItem.url).hostname;
        } catch {}
        return NextResponse.json(
          {
            error: "Could not extract readable article content",
            details: `Origin${domain ? ` (${domain})` : ""} returned insufficient body text or blocked automated extraction. Tap "Open in Web" to read directly.`
          },
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
