import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds, feedItems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feed = db.select().from(feeds).where(eq(feeds.id, id)).get();

    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const items = db
      .select()
      .from(feedItems)
      .where(eq(feedItems.feedId, id))
      .orderBy(desc(feedItems.publishedAt))
      .limit(20)
      .all();

    return NextResponse.json({ feed, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, category, editorialType, autoFullFetch, feedUrl, isMuted, isAuditWhitelisted } = body;

    const updates: Record<string, any> = {};
    if (typeof title === "string" && title.trim().length > 0) updates.title = title.trim();
    if (typeof category === "string" && category.trim().length > 0)
      updates.category = category.trim();
    if (typeof editorialType === "string" && editorialType.trim().length > 0)
      updates.editorialType = editorialType.trim();
    if (typeof autoFullFetch === "boolean") updates.autoFullFetch = autoFullFetch;
    if (typeof isMuted === "boolean") updates.isMuted = isMuted;
    if (typeof isAuditWhitelisted === "boolean") updates.isAuditWhitelisted = isAuditWhitelisted;
    if (typeof feedUrl === "string" && feedUrl.trim().length > 0) updates.feedUrl = feedUrl.trim();

    db.update(feeds).set(updates).where(eq(feeds.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Delete items first
    db.delete(feedItems).where(eq(feedItems.feedId, id)).run();

    // Delete feed
    db.delete(feeds).where(eq(feeds.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
