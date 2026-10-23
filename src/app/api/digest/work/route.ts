import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedItems, readingList, userProfiles } from "@/lib/db/schema";
import { eq, or, desc, and, inArray, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unDispatchedOnly = searchParams.get("newOnly") !== "false";

    // Query work items from feed_items
    const feedWorkItems = db
      .select({
        id: feedItems.id,
        title: feedItems.title,
        url: feedItems.url,
        author: feedItems.author,
        snippet: feedItems.snippet,
        userNotes: feedItems.userNotes,
        workDispatchedAt: feedItems.workDispatchedAt,
        publishedAt: feedItems.publishedAt,
        source: feedItems.feedId,
      })
      .from(feedItems)
      .where(eq(feedItems.isWork, true))
      .orderBy(desc(feedItems.publishedAt))
      .all();

    // Query work items from reading_list
    const readingListWorkItems = db
      .select({
        id: readingList.id,
        title: readingList.title,
        url: readingList.url,
        author: readingList.sourceContext,
        snippet: readingList.aiSummary,
        userNotes: readingList.userNotes,
        workDispatchedAt: readingList.workDispatchedAt,
        publishedAt: readingList.createdAt,
        source: readingList.sourceContext,
      })
      .from(readingList)
      .where(eq(readingList.isWork, true))
      .orderBy(desc(readingList.createdAt))
      .all();

    let allWorkItems = [...feedWorkItems, ...readingListWorkItems];

    if (unDispatchedOnly) {
      allWorkItems = allWorkItems.filter((i) => !i.workDispatchedAt);
    }

    const todayStr = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const profile = db.select().from(userProfiles).where(eq(userProfiles.id, "default")).get();
    const digestName = profile?.workDigestName || "Work";

    const subject = `Synapse ${digestName} Digest — ${todayStr} (${allWorkItems.length} items)`;

    const lines = [
      `# Synapse ${digestName} Digest — ${todayStr}`,
      `Curated articles and research items flagged for review.\n`,
    ];

    const teamsLines = [
      `📢 **Synapse ${digestName} Reading Digest — ${todayStr}** (${allWorkItems.length} items)`,
      "",
    ];

    allWorkItems.forEach((item, idx) => {
      // Markdown Email Format
      lines.push(`### ${idx + 1}. ${item.title}`);
      if (item.author) lines.push(`*Source / Author:* ${item.author}`);
      lines.push(`*Link:* ${item.url}`);
      if (item.userNotes && item.userNotes.trim().length > 0) {
        lines.push(`\n**💡 Notes & Highlights:**\n> ${item.userNotes.trim()}\n`);
      }
      if (item.snippet) {
        const cleanSnippet = item.snippet.replace(/<[^>]*>?/gm, "").slice(0, 300);
        lines.push(`*Summary:* ${cleanSnippet}...`);
      }
      lines.push("\n---\n");

      // Teams / Slack Format
      teamsLines.push(`**${idx + 1}. ${item.title}**`);
      teamsLines.push(`🔗 ${item.url}`);
      if (item.userNotes && item.userNotes.trim()) {
        teamsLines.push(`💡 *Notes:* ${item.userNotes.trim()}`);
      }
      if (item.snippet) {
        const cleanSnippet = item.snippet.replace(/<[^>]*>?/gm, "").slice(0, 200);
        teamsLines.push(`📝 ${cleanSnippet}...`);
      }
      teamsLines.push("");
    });

    const markdownBody = lines.join("\n");
    const teamsBody = teamsLines.join("\n");
    const mailtoRecipient = profile?.workDigestEmail || process.env.WORK_DIGEST_EMAIL || "";
    const mailtoUrl = mailtoRecipient
      ? `mailto:${mailtoRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(markdownBody)}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(markdownBody)}`;

    return NextResponse.json({
      items: allWorkItems,
      count: allWorkItems.length,
      subject,
      markdown: markdownBody,
      teamsText: teamsBody,
      mailtoUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemIds: string[] | undefined = body?.itemIds;
    const now = new Date();

    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      db.update(feedItems)
        .set({ workDispatchedAt: now })
        .where(and(eq(feedItems.isWork, true), inArray(feedItems.id, itemIds)))
        .run();

      db.update(readingList)
        .set({ workDispatchedAt: now })
        .where(and(eq(readingList.isWork, true), inArray(readingList.id, itemIds)))
        .run();
    } else {
      // Mark all currently undispatched work items
      db.update(feedItems)
        .set({ workDispatchedAt: now })
        .where(and(eq(feedItems.isWork, true), isNull(feedItems.workDispatchedAt)))
        .run();

      db.update(readingList)
        .set({ workDispatchedAt: now })
        .where(and(eq(readingList.isWork, true), isNull(readingList.workDispatchedAt)))
        .run();
    }

    return NextResponse.json({ success: true, dispatchedAt: now });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemIds: string[] | undefined = body?.itemIds;

    // Reset dispatched status so items return to pending queue
    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      db.update(feedItems)
        .set({ workDispatchedAt: null })
        .where(inArray(feedItems.id, itemIds))
        .run();

      db.update(readingList)
        .set({ workDispatchedAt: null })
        .where(inArray(readingList.id, itemIds))
        .run();
    } else {
      db.update(feedItems).set({ workDispatchedAt: null }).where(eq(feedItems.isWork, true)).run();

      db.update(readingList)
        .set({ workDispatchedAt: null })
        .where(eq(readingList.isWork, true))
        .run();
    }

    return NextResponse.json({ success: true, reset: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
