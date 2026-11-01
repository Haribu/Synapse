import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export interface ReconciliationResult {
  readingListStarred: number;
  readingListWork: number;
  feedItemsStarred: number;
  feedItemsWork: number;
  restoredFromSeed: number;
  obsidianReconciled: number;
}

/**
 * Reconciles and protects user data (starred items, work items, digests, notes)
 * across feed_items and reading_list.
 * Ensures data is preserved against upstream feed truncation and backup anomalies.
 */
export function reconcileUserData(sqlite: Database.Database): ReconciliationResult {
  const result: ReconciliationResult = {
    readingListStarred: 0,
    readingListWork: 0,
    feedItemsStarred: 0,
    feedItemsWork: 0,
    restoredFromSeed: 0,
    obsidianReconciled: 0,
  };

  try {
    // 1. Reading List: All items imported as read-later or feedly-import should have is_starred = 1
    const rlStarRes = sqlite
      .prepare(
        `UPDATE reading_list
         SET is_starred = 1
         WHERE (is_starred = 0 OR is_starred IS NULL)
           AND (
             tags LIKE '%read-later%'
             OR tags LIKE '%feedly-import%'
             OR tags IS NULL
             OR tags = ''
           )`
      )
      .run();
    result.readingListStarred = rlStarRes.changes;

    // 2. Reading List: Reconcile Work items (flagged research items, AI bubble, DEW #172 links)
    const rlWorkRes = sqlite
      .prepare(
        `UPDATE reading_list
         SET is_work = 1
         WHERE (is_work = 0 OR is_work IS NULL)
           AND (
             title LIKE '%The AI Bubble%'
             OR url LIKE '%nebulock.io%'
             OR url LIKE '%adeframework.org%'
             OR source_context LIKE '%DEW #172%'
           )`
      )
      .run();
    result.readingListWork = rlWorkRes.changes;

    // 3. Feed Items: Reconcile known starred text articles from user history and feedback
    const knownStarredTitles = [
      "The 15-Minute Patch, Reverse-Engineered: What Had to Be True?",
      "Introducing ADE-Skills — Adversarial Detection Engineering Knowledge Base",
      "I Spent Over 10 Hours Upgrading my Controllers",
      "The dawn of the age of the exoskeleton",
      "The dawn of the age of the\xa0exoskeleton",
      "EP231: AI Terms You Need to Know",
      "Building an evidence-grounded agentic security operations harness on Cloudflare",
      "The CISO's Craft: Watchmaker or Gardener?",
      "The CISO's Craft: Watchmaker or Gardener",
      "Why LLMs Agree With You Even When You’re Wrong",
      "Supporting the People Who Make Safe Operations Possible",
    ];

    const starStmt = sqlite.prepare(
      `UPDATE feed_items SET is_starred = 1 WHERE is_starred = 0 AND (title = ? OR title LIKE ?)`
    );
    for (const title of knownStarredTitles) {
      const res = starStmt.run(title, `%${title.slice(0, 30)}%`);
      result.feedItemsStarred += res.changes;
    }

    // 4. Feed Items: Reconcile known work articles
    const knownWorkTitles = [
      "Apple changes full-disk access permissions to curb abuse from AI agents",
      "Supporting the People Who Make Safe Operations Possible",
      "The AI Bubble Isn’t Where You Think It Is",
      "The AI Bubble Isn't Where You Think It Is",
    ];

    const workStmt = sqlite.prepare(
      `UPDATE feed_items SET is_work = 1 WHERE is_work = 0 AND (title = ? OR title LIKE ?)`
    );
    for (const title of knownWorkTitles) {
      const res = workStmt.run(title, `%${title.slice(0, 30)}%`);
      result.feedItemsWork += res.changes;
    }

    // 5. Restore any missing starred/work articles from host seed db or backups
    const candidateSeeds = [
      path.join("/app", "seed_data", "synapse.db"),
      path.join(process.cwd(), "data", "synapse.db"),
    ];

    for (const seedPath of candidateSeeds) {
      if (fs.existsSync(seedPath)) {
        try {
          // Attach seed database directly
          sqlite.exec(`ATTACH DATABASE '${seedPath}' AS seed_db;`);

          // Update existing feed_items that were starred/work in seed_db
          const mergeStarred = sqlite
            .prepare(
              `UPDATE feed_items
               SET is_starred = 1
               WHERE is_starred = 0
                 AND (
                   guid IN (SELECT guid FROM seed_db.feed_items WHERE is_starred = 1)
                   OR url IN (SELECT url FROM seed_db.feed_items WHERE is_starred = 1)
                   OR title IN (SELECT title FROM seed_db.feed_items WHERE is_starred = 1)
                 )`
            )
            .run();
          result.feedItemsStarred += mergeStarred.changes;

          const mergeWork = sqlite
            .prepare(
              `UPDATE feed_items
               SET is_work = 1,
                   work_dispatched_at = coalesce(work_dispatched_at, (
                     SELECT s.work_dispatched_at FROM seed_db.feed_items s
                     WHERE s.guid = feed_items.guid OR s.url = feed_items.url OR s.title = feed_items.title
                     LIMIT 1
                   ))
               WHERE is_work = 0
                 AND (
                   guid IN (SELECT guid FROM seed_db.feed_items WHERE is_work = 1)
                   OR url IN (SELECT url FROM seed_db.feed_items WHERE is_work = 1)
                   OR title IN (SELECT title FROM seed_db.feed_items WHERE is_work = 1)
                 )`
            )
            .run();
          result.feedItemsWork += mergeWork.changes;

          // Insert any missing starred or work feed items that existed in seed_db
          const insertMissing = sqlite
            .prepare(
              `INSERT OR IGNORE INTO feed_items (
                 id, feed_id, guid, title, url, author, snippet, full_content_html,
                 full_content_markdown, is_full_fetched, media_type, video_id,
                 thumbnail_url, is_read, is_starred, ai_summary, published_at,
                 created_at, is_work, work_dispatched_at
               )
               SELECT
                 s.id, s.feed_id, s.guid, s.title, s.url, s.author, s.snippet, s.full_content_html,
                 s.full_content_markdown, s.is_full_fetched, s.media_type, s.video_id,
                 s.thumbnail_url, s.is_read, s.is_starred, s.ai_summary, s.published_at,
                 s.created_at, s.is_work, s.work_dispatched_at
               FROM seed_db.feed_items s
               WHERE (s.is_starred = 1 OR s.is_work = 1)
                 AND s.url NOT IN (SELECT url FROM feed_items WHERE url IS NOT NULL)
                 AND s.title NOT IN (SELECT title FROM feed_items WHERE title IS NOT NULL)`
            )
            .run();
          result.restoredFromSeed += insertMissing.changes;

          sqlite.exec("DETACH DATABASE seed_db;");
          break; // successfully processed seed
        } catch (err) {
          try {
            sqlite.exec("DETACH DATABASE seed_db;");
          } catch {}
          console.warn("[Reconcile] Seed merge skipped:", err);
        }
      }
    }

    // 6. Obsidian Vault Reconciliation: check mounted vault for any exported articles
    const vaultPaths = [
      "/obsidian-vault/01 - Inbox/Synapse",
      path.join(process.cwd(), "obsidian-vault", "01 - Inbox", "Synapse"),
    ];

    for (const vaultDir of vaultPaths) {
      if (fs.existsSync(vaultDir)) {
        try {
          const files = fs.readdirSync(vaultDir).filter((f) => f.endsWith(".md") && f !== "Feedback-Log.md");
          for (const file of files) {
            const content = fs.readFileSync(path.join(vaultDir, file), "utf8");
            const titleMatch = content.match(/^title:\s*"([^"]+)"/m);
            const sourceMatch = content.match(/^source:\s*"([^"]+)"/m);
            const title = titleMatch ? titleMatch[1] : path.basename(file, ".md");
            const source = sourceMatch ? sourceMatch[1] : null;

            if (title) {
              const res1 = sqlite
                .prepare(`UPDATE feed_items SET is_starred = 1 WHERE is_starred = 0 AND (title = ? OR url = ?)`)
                .run(title, source);
              const res2 = sqlite
                .prepare(`UPDATE reading_list SET is_starred = 1 WHERE is_starred = 0 AND (title = ? OR url = ?)`)
                .run(title, source);
              result.obsidianReconciled += res1.changes + res2.changes;
            }
          }
        } catch (e) {
          console.warn("[Reconcile] Obsidian vault sync skipped:", e);
        }
      }
    }

    console.log(
      `[Reconcile] Completed: ${result.readingListStarred} RL starred, ${result.readingListWork} RL work, ${result.feedItemsStarred} feed starred, ${result.feedItemsWork} feed work, ${result.restoredFromSeed} restored from seed, ${result.obsidianReconciled} from Obsidian.`
    );
  } catch (err) {
    console.warn("[Reconcile] Reconciliation error:", err);
  }

  return result;
}
