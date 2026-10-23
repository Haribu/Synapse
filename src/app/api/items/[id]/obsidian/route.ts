import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedItems, feeds, readingList } from "@/lib/db/schema";
import { saveToObsidian } from "@/lib/services/obsidian-sync";
import { extractReadableContent } from "@/lib/services/readability-extractor";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { subfolder, userNotes: overrideNotes, tags: overrideTags } = body;

    // Check feed_items first
    const feedItemRow = db
      .select({
        item: feedItems,
        feedTitle: feeds.title,
        feedCategory: feeds.category,
        feedEditorialType: feeds.editorialType,
      })
      .from(feedItems)
      .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
      .where(eq(feedItems.id, id))
      .get();

    if (feedItemRow) {
      let markdown = feedItemRow.item.fullContentMarkdown;

      if (!markdown) {
        const extracted = await extractReadableContent(feedItemRow.item.url);
        if (extracted) {
          markdown = extracted.contentMarkdown;
          db.update(feedItems)
            .set({
              fullContentHtml: extracted.contentHtml,
              fullContentMarkdown: extracted.contentMarkdown,
              isFullFetched: true,
            })
            .where(eq(feedItems.id, id))
            .run();
        } else {
          markdown = feedItemRow.item.snippet || "No content extracted.";
        }
      }

      const tags = ["rss"];
      if (feedItemRow.feedCategory) {
        tags.push(feedItemRow.feedCategory.toLowerCase().replace(/[^a-z0-9]/g, "-"));
      }
      if (feedItemRow.item.tags) {
        const parsed = feedItemRow.item.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean);
        tags.push(...parsed);
      }
      if (Array.isArray(overrideTags)) {
        tags.push(...overrideTags);
      }

      const finalNotes =
        (overrideNotes !== undefined ? overrideNotes : feedItemRow.item.userNotes) || undefined;

      const saved = await saveToObsidian({
        title: feedItemRow.item.title,
        sourceUrl: feedItemRow.item.url,
        author: feedItemRow.item.author || undefined,
        publishedAt: feedItemRow.item.publishedAt || undefined,
        contentMarkdown: markdown || undefined,
        contentHtml: feedItemRow.item.fullContentHtml || undefined,
        thumbnailUrl: feedItemRow.item.thumbnailUrl || undefined,
        feedTitle: feedItemRow.feedTitle || undefined,
        originType: feedItemRow.item.mediaType === "video" ? "youtube" : "rss",
        editorialType: feedItemRow.feedEditorialType || "independent",
        userNotes: finalNotes,
        tags,
        subfolder,
      });

      return NextResponse.json({
        success: true,
        filePath: saved.filePath,
        imagesSaved: saved.imagesSaved,
      });
    }

    // Check reading_list (Research Inbox)
    const researchItem = db.select().from(readingList).where(eq(readingList.id, id)).get();

    if (researchItem) {
      let markdown = researchItem.fullContentMarkdown;

      if (!markdown) {
        const extracted = await extractReadableContent(researchItem.url);
        if (extracted) {
          markdown = extracted.contentMarkdown;
          db.update(readingList)
            .set({
              fullContentHtml: extracted.contentHtml,
              fullContentMarkdown: extracted.contentMarkdown,
            })
            .where(eq(readingList.id, id))
            .run();
        } else {
          markdown = researchItem.sourceContext || "No content extracted.";
        }
      }

      const tags = ["research-inbox", "read-later"];
      if (researchItem.tags) {
        const parsed = researchItem.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean);
        tags.push(...parsed);
      }
      if (Array.isArray(overrideTags)) {
        tags.push(...overrideTags);
      }

      const finalNotes =
        (overrideNotes !== undefined ? overrideNotes : researchItem.userNotes) || undefined;

      const saved = await saveToObsidian({
        title: researchItem.title,
        sourceUrl: researchItem.url,
        publishedAt: researchItem.createdAt || undefined,
        contentMarkdown: markdown || undefined,
        contentHtml: researchItem.fullContentHtml || undefined,
        parentNewsletterTitle: researchItem.sourceContext || undefined,
        originType: "newsletter_link",
        editorialType: "independent",
        userNotes: finalNotes,
        tags,
        subfolder,
      });

      return NextResponse.json({
        success: true,
        filePath: saved.filePath,
        imagesSaved: saved.imagesSaved,
      });
    }

    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  } catch (error: any) {
    const isVaultError = error.message?.includes("OBSIDIAN_VAULT_NOT_MOUNTED");
    return NextResponse.json(
      {
        error: error.message,
        code: isVaultError ? "VAULT_NOT_MOUNTED" : "EXPORT_FAILED",
      },
      { status: isVaultError ? 400 : 500 }
    );
  }
}
