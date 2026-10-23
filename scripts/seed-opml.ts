import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parseOPML } from "../src/lib/services/opml-parser";
import { db, sqlite } from "../src/lib/db";
import { feeds } from "../src/lib/db/schema";

async function main() {
  const opmlPath = process.argv[2] || path.join(process.cwd(), "feedly-export.opml");

  if (!fs.existsSync(opmlPath)) {
    console.error(`OPML file not found at: ${opmlPath}`);
    process.exit(1);
  }

  console.log(`\n📂 Reading Feedly OPML export from: ${opmlPath}`);
  const opmlContent = fs.readFileSync(opmlPath, "utf8");
  const parsedFeeds = parseOPML(opmlContent);

  console.log(`🔍 Total parsed feed outlines: ${parsedFeeds.length}`);

  let imported = 0;
  let skipped = 0;
  const categoriesCount: Record<string, number> = {};

  const now = new Date();

  for (const item of parsedFeeds) {
    const isYouTube = item.xmlUrl.includes("youtube.com") || item.xmlUrl.includes("playlist_id");
    const feedType = isYouTube ? "youtube" : "rss";

    try {
      db.insert(feeds)
        .values({
          id: crypto.randomUUID(),
          title: item.title,
          feedUrl: item.xmlUrl,
          siteUrl: item.htmlUrl || null,
          category: item.category || "General",
          feedType,
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();

      imported++;
      categoriesCount[item.category] = (categoriesCount[item.category] || 0) + 1;
    } catch {
      skipped++;
    }
  }

  console.log(`\n✅ Ingestion complete:`);
  console.log(`   - Imported feeds: ${imported}`);
  console.log(`   - Skipped / duplicates: ${skipped}`);
  console.log(`\n📊 Category Breakdown:`);
  for (const [cat, count] of Object.entries(categoriesCount).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${cat}: ${count} feeds`);
  }
}

main().catch(console.error);
