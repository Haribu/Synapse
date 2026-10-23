import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  try {
    const allFeeds = db.select().from(feeds).orderBy(asc(feeds.category), asc(feeds.title)).all();

    // Group by category
    const categorized = new Map<string, typeof allFeeds>();
    for (const f of allFeeds) {
      const cat = f.category || "General";
      if (!categorized.has(cat)) {
        categorized.set(cat, []);
      }
      categorized.get(cat)!.push(f);
    }

    const now = new Date().toUTCString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<opml version="2.0">\n`;
    xml += `  <head>\n`;
    xml += `    <title>Synapse Feeds Export</title>\n`;
    xml += `    <dateCreated>${now}</dateCreated>\n`;
    xml += `    <docs>http://opml.org/spec2.opml</docs>\n`;
    xml += `  </head>\n`;
    xml += `  <body>\n`;

    for (const [category, feedList] of categorized.entries()) {
      xml += `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`;
      for (const feed of feedList) {
        xml += `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.feedUrl)}" htmlUrl="${escapeXml(feed.siteUrl || feed.feedUrl)}" category="${escapeXml(feed.category || "General")}" />\n`;
      }
      xml += `    </outline>\n`;
    }

    xml += `  </body>\n`;
    xml += `</opml>\n`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="synapse-subscriptions.opml"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
