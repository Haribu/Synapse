import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedItems, readingList } from "@/lib/db/schema";
import { exportToGoogleDoc } from "@/lib/services/google-docs-export";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feedItem = db.select().from(feedItems).where(eq(feedItems.id, id)).get();

    if (feedItem) {
      const exported = await exportToGoogleDoc({
        title: feedItem.title,
        sourceUrl: feedItem.url,
        author: feedItem.author || undefined,
        contentMarkdown: feedItem.fullContentMarkdown || feedItem.snippet || "No content",
      });

      return NextResponse.json({ success: true, docUrl: exported.docUrl, docId: exported.docId });
    }

    const rlItem = db.select().from(readingList).where(eq(readingList.id, id)).get();
    if (rlItem) {
      const exported = await exportToGoogleDoc({
        title: rlItem.title,
        sourceUrl: rlItem.url,
        author: rlItem.sourceContext || undefined,
        contentMarkdown: rlItem.fullContentMarkdown || "No content",
      });

      return NextResponse.json({ success: true, docUrl: exported.docUrl, docId: exported.docId });
    }

    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
