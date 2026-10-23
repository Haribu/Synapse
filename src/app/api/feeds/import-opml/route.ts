import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { parseOPML } from "@/lib/services/opml-parser";
import { resolveYouTubeLongFormFeed } from "@/lib/services/youtube";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("opml") as File;

    if (!file) {
      return NextResponse.json({ error: "OPML file is required" }, { status: 400 });
    }

    const xmlContent = await file.text();
    const parsedFeeds = parseOPML(xmlContent);

    let importedCount = 0;
    const now = new Date();

    for (const item of parsedFeeds) {
      try {
        const resolvedXmlUrl = await resolveYouTubeLongFormFeed(item.xmlUrl);
        const isYouTube =
          resolvedXmlUrl.includes("youtube.com") || resolvedXmlUrl.includes("playlist_id");

        db.insert(feeds)
          .values({
            id: crypto.randomUUID(),
            title: item.title,
            feedUrl: resolvedXmlUrl,
            siteUrl: item.htmlUrl || null,
            category: item.category,
            feedType: isYouTube ? "youtube" : "rss",
            createdAt: now,
          })
          .onConflictDoNothing()
          .run();
        importedCount++;
      } catch {
        // Continue on individual feed conflict or error
      }
    }

    return NextResponse.json({
      success: true,
      totalParsed: parsedFeeds.length,
      importedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
