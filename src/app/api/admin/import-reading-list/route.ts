import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingList } from "@/lib/db/schema";
import { createDatabaseBackup } from "@/lib/services/backup-service";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1. Safety backup before bulk mutation
    const preBackup = await createDatabaseBackup();

    // 2. Read dataset from data/read-later-import.json or request body
    const body = await req.json().catch(() => ({}));
    let itemsToImport: Array<{
      title: string;
      url: string;
      source?: string;
      summary?: string;
      hasBody?: boolean;
      body?: string | null;
      isNewsletter?: boolean;
      tags?: string[];
    }> = body.items;

    if (!itemsToImport || !Array.isArray(itemsToImport) || itemsToImport.length === 0) {
      const filePath = path.join(process.cwd(), "data", "read-later-import.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        itemsToImport = JSON.parse(fileContent);
      } else {
        return NextResponse.json(
          { error: "data/read-later-import.json not found and no items provided in request" },
          { status: 400 }
        );
      }
    }

    let insertedCount = 0;
    let skippedCount = 0;
    const now = new Date();

    for (const item of itemsToImport) {
      if (!item.url || !item.title) continue;

      const existing = db
        .select({ id: readingList.id })
        .from(readingList)
        .where(eq(readingList.url, item.url))
        .get();

      if (existing) {
        skippedCount++;
        continue;
      }

      const id = crypto.randomUUID();
      const tagsString = Array.isArray(item.tags)
        ? item.tags.join(",")
        : "read-later,feedly-import";

      db.insert(readingList)
        .values({
          id,
          url: item.url,
          title: item.title,
          sourceFeedItemId: null,
          sourceContext: item.source || (item.isNewsletter ? "Feedly Inbound Newsletter" : null),
          fullContentMarkdown: item.body || null,
          fullContentHtml: item.body
            ? `<div class="prose max-w-none dark:prose-invert">${item.body.replace(/\n/g, "<br/>")}</div>`
            : null,
          isRead: false,
          isStarred: false,
          isWork: false,
          userNotes: null,
          tags: tagsString,
          createdAt: now,
        })
        .run();

      insertedCount++;
    }

    return NextResponse.json({
      success: true,
      totalCandidates: itemsToImport.length,
      inserted: insertedCount,
      skipped: skippedCount,
      backup: preBackup.filename,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
