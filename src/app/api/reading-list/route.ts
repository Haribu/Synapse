import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingList, feedItems } from "@/lib/db/schema";
import { cleanUrl } from "@/lib/services/link-cleaner";
import { extractReadableContent } from "@/lib/services/readability-extractor";
import { desc, eq } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = db.select().from(readingList).orderBy(desc(readingList.createdAt)).all();

    // Self-healing: if any items in readingList have empty content (<50 chars) but point to a sourceFeedItemId, backfill immediately
    for (const item of items) {
      if ((!item.fullContentHtml || item.fullContentHtml.length < 50) && item.sourceFeedItemId) {
        try {
          const parent = db
            .select()
            .from(feedItems)
            .where(eq(feedItems.id, item.sourceFeedItemId))
            .get();
          if (parent && (parent.fullContentHtml || parent.snippet)) {
            const backfillHtml = parent.fullContentHtml || `<p>${parent.snippet}</p>`;
            const backfillMd = parent.fullContentMarkdown || parent.snippet || "";
            db.update(readingList)
              .set({
                fullContentHtml: backfillHtml,
                fullContentMarkdown: backfillMd,
              })
              .where(eq(readingList.id, item.id))
              .run();
            item.fullContentHtml = backfillHtml;
            item.fullContentMarkdown = backfillMd;
          }
        } catch {}
      }
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, title, sourceFeedItemId, sourceContext, fullContentHtml, fullContentMarkdown } =
      body;

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const cleanedUrl = cleanUrl(url);
    const existing = db.select().from(readingList).where(eq(readingList.url, cleanedUrl)).get();

    if (existing) {
      // If existing item is empty (<50 chars) and we now have content, backfill it!
      if (
        (!existing.fullContentHtml || existing.fullContentHtml.length < 50) &&
        (fullContentHtml || sourceFeedItemId)
      ) {
        let updateHtml = fullContentHtml;
        let updateMd = fullContentMarkdown;
        if (!updateHtml && sourceFeedItemId) {
          const parent = db
            .select()
            .from(feedItems)
            .where(eq(feedItems.id, sourceFeedItemId))
            .get();
          if (parent?.fullContentHtml) {
            updateHtml = parent.fullContentHtml;
            updateMd = parent.fullContentMarkdown;
          }
        }
        if (updateHtml) {
          db.update(readingList)
            .set({ fullContentHtml: updateHtml, fullContentMarkdown: updateMd })
            .where(eq(readingList.id, existing.id))
            .run();
          existing.fullContentHtml = updateHtml;
          existing.fullContentMarkdown = updateMd;
        }
      }
      return NextResponse.json({ success: true, item: existing, existed: true });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    let finalTitle = title || sourceContext || cleanedUrl;
    let contentHtml = fullContentHtml || "";
    let contentMarkdown = fullContentMarkdown || "";

    // 1. If content was not passed directly, check if sourceFeedItemId already has content
    if ((!contentHtml || contentHtml.length < 50) && sourceFeedItemId) {
      const parent = db.select().from(feedItems).where(eq(feedItems.id, sourceFeedItemId)).get();
      if (parent) {
        if (parent.fullContentHtml) contentHtml = parent.fullContentHtml;
        if (parent.fullContentMarkdown) contentMarkdown = parent.fullContentMarkdown;
        if (!title && parent.title) finalTitle = parent.title;
      }
    }

    // 2. If still empty, attempt extraction from the cleaned URL
    if (!contentHtml || contentHtml.length < 50) {
      try {
        const extracted = await extractReadableContent(cleanedUrl);
        if (extracted) {
          if (!title || title.trim().length === 0) {
            finalTitle = extracted.title;
          }
          contentHtml = extracted.contentHtml;
          contentMarkdown = extracted.contentMarkdown;
        }
      } catch {
        // Fallback if network fails, we still keep the link in reading list
      }
    }

    if (!contentHtml || contentHtml.trim().length === 0) {
      contentHtml = `<div class="p-6 my-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-center space-y-3">
        <h3 class="font-bold text-amber-900 dark:text-amber-200 text-base">Bot Challenge / Verification Required</h3>
        <p class="text-xs text-amber-800 dark:text-amber-300 max-w-md mx-auto">
          This publisher is protected by Cloudflare / Turnstile bot verification. Synapse cannot bypass interactive challenges automatically without browser session cookies.
        </p>
        <div class="pt-2">
          <a href="${cleanedUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all">
            <span>Open Article in Browser</span>
          </a>
        </div>
      </div>`;
    }

    const newItem = {
      id,
      url: cleanedUrl,
      title: finalTitle,
      sourceFeedItemId: sourceFeedItemId || null,
      sourceContext: sourceContext || null,
      fullContentHtml: contentHtml,
      fullContentMarkdown: contentMarkdown,
      isRead: false,
      isStarred: false,
      userNotes: body.userNotes || null,
      tags: Array.isArray(body.tags) ? body.tags.join(",") : body.tags || null,
      createdAt: now,
    };

    db.insert(readingList).values(newItem).run();

    return NextResponse.json({ success: true, item: newItem });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, isRead, isStarred, isWork, workDispatchedAt, userNotes, tags } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
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

    db.update(readingList).set(updates).where(eq(readingList.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    db.delete(readingList).where(eq(readingList.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
