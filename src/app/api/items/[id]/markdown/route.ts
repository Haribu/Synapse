import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedItems, feeds, readingList } from "@/lib/db/schema";
import { extractReadableContent } from "@/lib/services/readability-extractor";
import { cleanAuthor, cleanArticleMarkdown } from "@/lib/utils/clean-article";
import { sanitizeFileName } from "@/lib/services/obsidian-sync";
import { eq } from "drizzle-orm";
import TurndownService from "turndown";

export const dynamic = "force-dynamic";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

turndown.addRule("removeGarbage", {
  filter: ["script", "style", "noscript", "iframe"],
  replacement: () => "",
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 1. Try feed_items
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
      const item = feedItemRow.item;
      let rawMarkdown = item.fullContentMarkdown || "";

      if (!rawMarkdown) {
        if (item.fullContentHtml) {
          rawMarkdown = turndown.turndown(item.fullContentHtml);
        } else {
          const extracted = await extractReadableContent(item.url);
          if (extracted) {
            rawMarkdown = extracted.contentMarkdown;
          } else {
            rawMarkdown = item.snippet || "No content extracted.";
          }
        }
      }

      rawMarkdown = cleanArticleMarkdown(rawMarkdown, item.title);
      const safeTitle = sanitizeFileName(item.title || "Untitled Article");

      const tags = ["literature-note", "rss"];
      if (feedItemRow.feedCategory) {
        tags.push(feedItemRow.feedCategory.toLowerCase().replace(/[^a-z0-9]/g, "-"));
      }
      if (item.tags) {
        tags.push(
          ...item.tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        );
      }

      const frontmatter = [
        "---",
        `title: "${item.title.replace(/"/g, '\\"')}"`,
        `source: "${item.url}"`,
        `author: "${cleanAuthor(item.author) || "Unknown"}"`,
        `date_saved: "${new Date().toISOString()}"`,
        item.publishedAt ? `date_published: "${new Date(item.publishedAt).toISOString()}"` : null,
        feedItemRow.feedTitle ? `feed: "${feedItemRow.feedTitle.replace(/"/g, '\\"')}"` : null,
        `origin_type: "rss"`,
        `editorial_type: "${feedItemRow.feedEditorialType || "independent"}"`,
        "tags:",
        ...tags.map((t) => `  - ${t}`),
        `status: "to-review"`,
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      let userNotesCallout = "";
      if (item.userNotes && item.userNotes.trim().length > 0) {
        const quoted = item.userNotes
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        userNotesCallout = `> [!NOTE] 🧠 Personal Synthesis & Takeaways\n${quoted}\n\n`;
      }

      const fileContent = `${frontmatter}# ${item.title}\n\n${userNotesCallout}**Source:** [${item.url}](${item.url})\n\n${rawMarkdown}\n`;

      return new NextResponse(fileContent, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeTitle}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // 2. Try reading_list
    const researchItem = db.select().from(readingList).where(eq(readingList.id, id)).get();

    if (researchItem) {
      let rawMarkdown = researchItem.fullContentMarkdown || "";
      if (!rawMarkdown && researchItem.fullContentHtml) {
        rawMarkdown = turndown.turndown(researchItem.fullContentHtml);
      }
      rawMarkdown = cleanArticleMarkdown(rawMarkdown, researchItem.title);
      const safeTitle = sanitizeFileName(researchItem.title || "Untitled Article");

      const tags = ["literature-note", "research-inbox"];
      if (researchItem.tags) {
        tags.push(
          ...researchItem.tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        );
      }

      const frontmatter = [
        "---",
        `title: "${researchItem.title.replace(/"/g, '\\"')}"`,
        `source: "${researchItem.url}"`,
        `date_saved: "${new Date().toISOString()}"`,
        researchItem.createdAt
          ? `date_published: "${new Date(researchItem.createdAt).toISOString()}"`
          : null,
        researchItem.sourceContext
          ? `parent_newsletter: "${researchItem.sourceContext.replace(/"/g, '\\"')}"`
          : null,
        `origin_type: "newsletter_link"`,
        `editorial_type: "independent"`,
        "tags:",
        ...tags.map((t) => `  - ${t}`),
        `status: "to-review"`,
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");

      let userNotesCallout = "";
      if (researchItem.userNotes && researchItem.userNotes.trim().length > 0) {
        const quoted = researchItem.userNotes
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        userNotesCallout = `> [!NOTE] 🧠 Personal Synthesis & Takeaways\n${quoted}\n\n`;
      }

      const fileContent = `${frontmatter}# ${researchItem.title}\n\n${userNotesCallout}**Source:** [${researchItem.url}](${researchItem.url})\n\n${rawMarkdown}\n`;

      return new NextResponse(fileContent, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeTitle}.md"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
