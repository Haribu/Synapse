import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Feedly-style "Mark all as read". Scope is a single feed, a whole category,
 * or everything when neither is supplied.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const feedId: string | undefined = body.feedId || undefined;
    const category: string | undefined = body.category || undefined;

    let changes = 0;
    if (feedId) {
      changes = sqlite
        .prepare("UPDATE feed_items SET is_read = 1 WHERE is_read = 0 AND feed_id = ?")
        .run(feedId).changes;
    } else if (category) {
      changes = sqlite
        .prepare(
          "UPDATE feed_items SET is_read = 1 WHERE is_read = 0 AND feed_id IN (SELECT id FROM feeds WHERE category = ?)"
        )
        .run(category).changes;
    } else {
      changes = sqlite.prepare("UPDATE feed_items SET is_read = 1 WHERE is_read = 0").run().changes;
    }

    return NextResponse.json({ success: true, marked: changes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
