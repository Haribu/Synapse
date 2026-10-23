import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { STARTER_PACKS } from "@/lib/data/starter-packs";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";
import { syncSingleFeed } from "@/lib/services/sync-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    packs: STARTER_PACKS,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { packIds = [] } = body;

    if (!Array.isArray(packIds) || packIds.length === 0) {
      return NextResponse.json({ error: "packIds array is required" }, { status: 400 });
    }

    const selectedPacks = STARTER_PACKS.filter((p) => packIds.includes(p.id));
    if (selectedPacks.length === 0) {
      return NextResponse.json({ error: "No matching starter packs found" }, { status: 404 });
    }

    let addedCount = 0;
    let skippedCount = 0;
    const addedFeeds: Array<{ id: string; title: string }> = [];

    for (const pack of selectedPacks) {
      for (const item of pack.feeds) {
        // Check if already subscribed
        const existing = db
          .select({ id: feeds.id })
          .from(feeds)
          .where(
            or(
              eq(feeds.feedUrl, item.feedUrl),
              item.siteUrl ? eq(feeds.siteUrl, item.siteUrl) : eq(feeds.feedUrl, item.feedUrl)
            )
          )
          .get();

        if (existing) {
          skippedCount++;
          continue;
        }

        const id = crypto.randomUUID();
        const now = new Date();

        db.insert(feeds)
          .values({
            id,
            title: item.title,
            feedUrl: item.feedUrl,
            siteUrl: item.siteUrl || item.feedUrl,
            category: pack.category,
            feedType: "rss",
            editorialType: item.editorialType || "independent",
            autoFullFetch: false,
            errorCount: 0,
            createdAt: now,
          })
          .run();

        addedCount++;
        addedFeeds.push({ id, title: item.title });

        // Queue initial background fetch asynchronously
        syncSingleFeed(id).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      addedCount,
      skippedCount,
      addedFeeds,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
